// The removal rule (docs/design/endless.md section 7), as one definition for the game, Alma and the engine.
// A plain leaf with no imports, so the save store, which runs under plain Node in its tests, can use it.

/** A quarter under 70 overall is a strike. */
export const STRIKE_BELOW = 70;

/**
 * The strikes counting after the quarters played, oldest first. A strike counts in its own quarter and the three
 * after: "removal" counts the last four played, for the check at the end of the quarter; "next" counts the last
 * three, for the quarter being prepared (Alma's "no piling on", the memo).
 */
export function strikes(overall: readonly number[], window: 'removal' | 'next'): number {
  return overall.slice(window === 'removal' ? -4 : -3).filter((score) => score < STRIKE_BELOW).length;
}

/** The index of the quarter whose third counting strike removed the player, or null. */
export function removedAt(overall: readonly number[]): number | null {
  for (let i = 0; i < overall.length; i++) if (strikes(overall.slice(0, i + 1), 'removal') >= 3) return i;
  return null;
}
