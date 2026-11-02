// The song changing under a tap (David, 1 Nov 2026): "If the user tap is
// detected literally 1 millisecond after the track is changed, I promise you
// they were trying to interact with the previous track". It takes a person
// about a quarter of a second to see a change and act on it, and a tap begun
// on the old name can land later still, so for half a second after the name
// on screen changes, a tap is taken as meant for the song that was there.
// Timed from when the finger (or key) went down, not when it lifted.

/** how long after the name on screen changes a tap still means the song before */
export const GRACE_MS = 500;
/** the pop-up shows itself this many seconds before a song ends */
export const END_S = 8;

/** whether a tap pressed at `pressedAt` was meant for the song before the change at `changedAt` (both performance.now() times) */
export function meantForBefore(pressedAt: number, changedAt: number | null): boolean {
  return changedAt !== null && pressedAt - changedAt < GRACE_MS;
}

/** whether the pop-up should show itself now, for the song ending: `left` is its seconds left (null while unknown) */
export function nearEnd(left: number | null): boolean {
  return left !== null && left <= END_S;
}
