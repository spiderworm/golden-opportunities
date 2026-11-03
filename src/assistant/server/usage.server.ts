// Which of Dewey's questions count against the daily caps (platform/usage.server.ts): only one that comes with a
// real game, since only that one can reach a model. Without a game, or with a save cookie that names none, Dewey
// answers "Start a game" and asks nothing, so counting it would let anyone with curl spend the copy's whole day
// for free (Probe's red-team of #319).

import { resolveSaveId } from "~/game/session.server";
import { spend, type Cap } from "~/platform/usage.server";

/** This question's game: its save's id, or null without one (no save cookie, or one that names no save). */
export function gameOf(request: Request, resolve: (request: Request) => string = resolveSaveId) {
  try {
    return resolve(request);
  } catch {
    return null;
  }
}

export function deweyUsage(
  request: Request,
  {
    resolve = resolveSaveId,
    count = spend,
  }: { resolve?: (request: Request) => string; count?: typeof spend } = {},
): Cap | null {
  // No save cookie, or one that names no save: no game, so no model, and nothing to count.
  const save = gameOf(request, resolve);
  return save === null ? null : count("dewey", save);
}
