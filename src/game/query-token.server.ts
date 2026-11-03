import { visitorAllowsSharing } from "../platform/analytics/visitor-sharing.server";
import { randomBytes } from "node:crypto";
import { QueryError } from "../query/errors";
import { saves } from "./session.server";
import { SaveError } from "./store.server";
import { trackServer } from "../platform/analytics/analytics.server";

export const QUERY_TOKEN_TTL_MS = 180_000;
const grants = new Map<
  string,
  {
    saveId: string;
    queryRevision: number;
    expires: number;
    timer: ReturnType<typeof setTimeout>;
    sharing: boolean;
  }
>();
function event(name: string) {
  try {
    trackServer(name);
  } catch {
    /* Analytics must not change access. */
  }
}
function remove(token: string) {
  const grant = grants.get(token);
  if (grant) clearTimeout(grant.timer);
  grants.delete(token);
}
/** Only the server spawner calls this. Tokens travel solely in the child's environment. */
export function issueGameQueryToken(saveId: string): { token: string; revoke: () => void } {
  const save = saves.read(saveId);
  for (const [key, grant] of grants) if (grant.expires <= Date.now()) remove(key);
  if (grants.size >= 64 || [...grants.values()].filter((g) => g.saveId === saveId).length >= 4)
    throw new QueryError("RATE_LIMITED", "Too many active query sessions.");
  const token = randomBytes(32).toString("base64url");
  const timer = setTimeout(() => remove(token), QUERY_TOKEN_TTL_MS);
  timer.unref();
  grants.set(token, {
    saveId,
    queryRevision: save.queryRevision ?? save.revision,
    expires: Date.now() + QUERY_TOKEN_TTL_MS,
    timer,
    // The asking visitor's "Share play data" choice, for the lookups that arrive with this token (#368).
    sharing: visitorAllowsSharing(),
  });
  event("game_query_session_started");
  return {
    token,
    revoke: () => {
      if (grants.has(token)) event("game_query_session_revoked");
      remove(token);
    },
  };
}
/** Whether the visitor whose question issued this token shares play data; true for an unknown one. */
export const queryTokenSharing = (token: string) => grants.get(token)?.sharing ?? true;
/** Unknown, revoked and expired capabilities intentionally share one bounded error. */
export function saveForQueryToken(token: string) {
  const grant = grants.get(token);
  const ended = () => {
    remove(token);
    return new QueryError("SESSION_ENDED", "That session ended. Start a new question.");
  };
  if (!grant || grant.expires <= Date.now()) throw ended();
  try {
    const save = saves.read(grant.saveId);
    if ((save.queryRevision ?? save.revision) !== grant.queryRevision) throw ended();
    return save;
  } catch (error) {
    if (error instanceof SaveError && error.code === "MISSING_SAVE") throw ended();
    if (error instanceof SaveError && error.code === "SAVE_BUSY")
      throw new QueryError("RATE_LIMITED", "Game state is busy. Retry shortly.");
    throw error;
  }
}
