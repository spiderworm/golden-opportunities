import { startNewGame } from "~/game/game.server";
import type { Route } from "./+types/new-game";

/** POST /game/new: Play again, from the half-year review. A new save from 1 January; the old one expires unused. */
export function action({ request }: Route.ActionArgs) {
  const cookie = startNewGame(request);
  return new Response(null, { status: 303, headers: { Location: "/", "Set-Cookie": cookie, "Cache-Control": "no-store" } });
}
