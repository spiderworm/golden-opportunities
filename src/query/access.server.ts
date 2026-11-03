import { QueryError } from "./errors";
import { resolveSaveId, saves, queryViewForSave } from "../game/session.server";
import { queryTokenSharing, saveForQueryToken } from "../game/query-token.server";
import { SaveError } from "../game/store.server";
import { ReplayMismatch } from "../game/replay.server";
import type { GameSave } from "../game/types";
import { isSameOriginBrowserRequest } from "../platform/origin.server";

/**
 * Shared browser boundary: a same-origin request on this machine, or from the deployed origin
 * (ORBITAL_PUBLIC_ORIGIN; platform/origin.server.ts). Host never chooses a token destination or save.
 */
export const isLocalBrowserRequest = isSameOriginBrowserRequest;
export interface QueryAccess {
  kind: "browser" | "agent";
  save: GameSave;
  /** For Dewey's lookups: the asking visitor's "Share play data" choice, carried on the token (#368). */
  sharing?: boolean;
}
export function authorizeQuery(request: Request): QueryAccess {
  const authorization = request.headers.get("authorization");
  if (authorization !== null) {
    const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(authorization);
    if (!match) throw new QueryError("UNAUTHORIZED", "A valid query bearer token is required.");
    return {
      kind: "agent",
      save: saveForQueryToken(match[1]),
      sharing: queryTokenSharing(match[1]),
    };
  }
  if (!isLocalBrowserRequest(request))
    throw new QueryError("UNAUTHORIZED", "Use a same-origin browser request.");
  try {
    return { kind: "browser", save: saves.read(resolveSaveId(request)) };
  } catch (error) {
    if (error instanceof SaveError && error.code === "MISSING_SAVE")
      throw new QueryError("UNAUTHORIZED", "Start a game first.");
    if (error instanceof SaveError && error.code === "SAVE_BUSY")
      throw new QueryError("RATE_LIMITED", "Game state is busy. Retry shortly.");
    throw error;
  }
}
/** Uses the authorized snapshot; request bodies cannot grant periods or select saves. */
export function viewForAccess(access: QueryAccess) {
  try {
    return queryViewForSave(access.save);
  } catch (error) {
    // A save this version can't replay: a pin or Dewey says so, rather than an internal error (Audit, #198).
    if (error instanceof ReplayMismatch)
      throw new QueryError(
        "SAVE_NOT_REPLAYABLE",
        "This game was saved by an earlier version, and can't be replayed. Start over from Settings.",
      );
    throw error;
  }
}
