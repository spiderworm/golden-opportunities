import { trackServer } from "~/platform/analytics/analytics.server";
import type { Route } from "./+types/route";
import { ENTRY_COOKIE, ENTRY_MAX_AGE, ENTRY_VERSION, MUSIC_COOKIE } from "./cookie";
import { entryResponse, NO_INDEX, safeReturn } from "./gate.server";

/**
 * POST /entry: Continue, from the entry page. With the agreement ticked, it sets the entry cookie (and, with the
 * music unticked, the one-time music choice) and goes back to the page the player asked for. Without it, the page
 * again. The checkbox's words aren't stored: the version stands for them.
 */
export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const to = safeReturn(form.get("to"));
  if (form.get("agree") !== "yes") return entryResponse(to);
  const music = form.get("music") === "on" ? "on" : "off";
  trackServer("entry_accepted", { music });
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  const headers = new Headers({
    Location: to,
    "Cache-Control": "no-store",
    "X-Robots-Tag": NO_INDEX,
  });
  headers.append(
    "Set-Cookie",
    `${ENTRY_COOKIE}=${ENTRY_VERSION}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ENTRY_MAX_AGE}${secure}`,
  );
  // Read once by the music player in the browser, so not HttpOnly: "off" starts it paused, and "on" starts it at once,
  // while the page still has Continue's user activation. The player clears it once read.
  headers.append(
    "Set-Cookie",
    `${MUSIC_COOKIE}=${music}; Path=/; SameSite=Lax; Max-Age=3600${secure}`,
  );
  return new Response(null, { status: 303, headers });
}

/** GET /entry: nothing to show here, so on into the game, or to the entry page if not yet agreed. */
export function loader() {
  return new Response(null, { status: 303, headers: { Location: "/" } });
}
