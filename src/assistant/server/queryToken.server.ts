import { resolveSaveId } from "~/game/session.server";
import { issueGameQueryToken } from "~/game/query-token.server";

/** Server-only per-answer capability; never put this in prompts or tool arguments. */
export function queryToken(request: Request) {
  return issueGameQueryToken(resolveSaveId(request));
}
