import { useSyncExternalStore } from "react";

import { isPhoneScreen, PHONE_QUERY } from "~/platform/phone";

// Orbital Books isn't laid out for phones: a phone gets one scene instead of
// the game (m1-copy section 8). What counts as a phone is platform/phone.ts's
// PHONE_QUERY; PhoneScreen.module.css repeats it, so the phone sees its scene
// before the page's scripts run.
export { PHONE_QUERY };

/** Whether this is a phone; false on the server and until the browser says. */
export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribe, isPhoneScreen, () => false);
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
