import { useSyncExternalStore } from "react";

// Orbital Books isn't laid out for phones: a phone gets one scene instead of
// the game (m1-copy section 8). A phone is a coarse pointer on a screen whose
// short side is 600 px or less, so a tablet gets the game, and so does a
// desktop window dragged narrow (its pointer is fine). Decided in the browser,
// never from the user agent. PhoneScreen.module.css repeats this query, so the
// phone sees its scene before the page's scripts run.
export const PHONE_QUERY = "(pointer: coarse) and (max-width: 600px), (pointer: coarse) and (max-height: 600px)";

/** Whether this is a phone; false on the server and until the browser says. */
export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribe, isPhone, () => false);
}

function isPhone() {
  return typeof matchMedia === "function" && matchMedia(PHONE_QUERY).matches;
}

function subscribe(changed: () => void) {
  if (typeof matchMedia !== "function") return () => {};
  const query = matchMedia(PHONE_QUERY);
  query.addEventListener("change", changed);
  return () => query.removeEventListener("change", changed);
}

/** The screen's short side in a coarse bucket, the only thing phone_blocked records about it. */
export function sizeBucket(width: number, height: number): string {
  const short = Math.min(width, height);
  if (short < 360) return "under 360";
  if (short < 400) return "360-399";
  if (short < 480) return "400-479";
  return "480-600";
}
