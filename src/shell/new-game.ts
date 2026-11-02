import { resetGame, startNewGame } from "~/game/game.server";
import type { Route } from "./+types/new-game";

/**
 * POST /game/new: Play again, from the half-year review; or, as /game/new?reset=1, Reset game, from Settings, at
 * any point. A new save from 1 January; the old one expires unused. The body is never read.
 */
export function action({ request }: Route.ActionArgs) {
  const reset = new URL(request.url).searchParams.get("reset") === "1";
  const cookie = reset ? resetGame(request) : startNewGame(request);
  return new Response(null, { status: 303, headers: { Location: "/", "Set-Cookie": cookie, "Cache-Control": "no-store" } });
}
