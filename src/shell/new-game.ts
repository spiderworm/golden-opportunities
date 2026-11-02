import { resetGame, startNewGame } from "~/game/game.server";
import type { Route } from "./+types/new-game";

/**
 * POST /game/new: Play again, from the half-year review; or, with `reset=1` in the form, Reset game, from
 * Settings, at any point. A new save from 1 January; the old one expires unused.
 */
export async function action({ request }: Route.ActionArgs) {
  const form = await request.clone().formData().catch(() => null);
  const cookie = form?.get("reset") === "1" ? resetGame(request) : startNewGame(request);
  return new Response(null, { status: 303, headers: { Location: "/", "Set-Cookie": cookie, "Cache-Control": "no-store" } });
}
