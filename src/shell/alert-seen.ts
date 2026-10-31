import { markAlertSeen } from "~/game/game.server";
import type { Route } from "./+types/alert-seen";

/** POST /alert/seen: the player opened or put off the Commerce Office's transmission. */
export function action({ request }: Route.ActionArgs) {
  markAlertSeen(request);
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
