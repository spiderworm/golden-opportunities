// What counts as a phone, for every part of the app that needs to know: a
// coarse pointer on a screen whose short side is 600 px or less, so a tablet
// gets the game, and so does a desktop window dragged narrow (its pointer is
// fine). Decided in the browser, never from the user agent. The phone screen
// (src/phone) shows itself on one instead of the game.
export const PHONE_QUERY = "(pointer: coarse) and (max-width: 600px), (pointer: coarse) and (max-height: 600px)";

/** Whether this is a phone; false on the server. */
export function isPhoneScreen(): boolean {
  return typeof matchMedia === "function" && matchMedia(PHONE_QUERY).matches;
}

/** The only event a phone records: that it got the phone screen (m1-copy section 8). */
export const PHONE_EVENT = "phone_blocked";
