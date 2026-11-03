import { trackServer } from "~/platform/analytics/analytics.server";
import { BodyRefused, readCappedForm } from "~/platform/body.server";
import { servedOverHttps } from "~/platform/origin.server";
import type { Route } from "./+types/route";
import { ENTRY_COOKIE, ENTRY_MAX_AGE, ENTRY_VERSION, MUSIC_COOKIE } from "./cookie";
import { entryResponse, NO_INDEX, safeReturn } from "./gate.server";

/** The entry form is a checkbox, a choice and a return path: well under 4 KB, which no other body needs. */
export const MAX_ENTRY_BODY = 4_096;

/**
 * POST /entry: Continue, from the entry page. With the agreement ticked, it sets the entry cookie (and, with the
 * music unticked, the one-time music choice) and goes back to the page the player asked for. Without it, the page
 * again. The checkbox's words aren't stored: the version stands for them.
 */
export async function action({ request }: Route.ActionArgs) {
  let form: URLSearchParams;
  try {
    // Every public visitor can post here: read with a cap and a deadline (src/platform/body.server.ts).
    form = await readCappedForm(request, MAX_ENTRY_BODY);
  } catch (error) {
    if (!(error instanceof BodyRefused)) throw error;
    return new Response(error.message, {
      status: error.status,
      headers: { "Cache-Control": "no-store", "X-Robots-Tag": NO_INDEX },
    });
  }
  const to = safeReturn(form.get("to"));
  if (form.get("agree") !== "yes") return entryResponse(to);
  const music = form.get("music") === "on" ? "on" : "off";
  trackServer("entry_accepted", { music });
  // Behind the deployed proxy request.url is http, but the page was https (platform/origin.server.ts).
  const secure = servedOverHttps(request) ? "; Secure" : "";
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
