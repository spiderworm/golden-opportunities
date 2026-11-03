import { markAlertSeen } from "~/game/game.server";
import type { Route } from "./+types/alert-seen";

/**
 * POST /alert/seen: the player opened or put off the Commerce Office's transmission. It's best effort: a write the
 * game refuses (no game, a busy save, a request from elsewhere) answers with its status rather than throwing, so it
 * never takes the page to its error screen (David, 3 Nov 2026: Later replaced the station with "Something went
 * wrong"). The transmission simply comes back on the next visit.
 */
export function action({ request }: Route.ActionArgs) {
  try {
    markAlertSeen(request);
  } catch (error) {
    if (!(error instanceof Response)) throw error;
    return new Response(null, { status: error.status, headers: { "Cache-Control": "no-store" } });
  }
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
