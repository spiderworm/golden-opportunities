// The entry page's cookies. ENTRY_VERSION goes up whenever what the player agrees to changes, so it's shown again.

export const ENTRY_COOKIE = "ob_entry";
export const ENTRY_VERSION = "1";
/** The music choice, set with the agreement and read once by the music player, which then clears it. */
export const MUSIC_COOKIE = "ob_music";
/** One year. */
export const ENTRY_MAX_AGE = 31_536_000;

/** Whether the request carries the current agreement. */
export function hasAgreed(cookieHeader: string | null): boolean {
  return readCookie(cookieHeader, ENTRY_COOKIE) === ENTRY_VERSION;
}

export function readCookie(cookieHeader: string | null | undefined, name: string): string | null {
  for (const part of (cookieHeader ?? "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return null;
}
