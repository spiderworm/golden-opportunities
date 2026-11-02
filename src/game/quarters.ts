// The quarters the game can play. Names and arithmetic are the simulation's (src/simulation/quarters.ts); with the
// endless loop (docs/design/endless.md) quarters run on past the two built so far, so PLAYABLE_QUARTERS says how
// many the game plays today. Plain relative imports only: store.server.ts runs under plain Node in its tests.
import { isQuarterName, quarterAt, quarterIndex, type QuarterId } from '../simulation/quarters.ts';

export { FIRST_QUARTER, compareQuarters, isQuarterName, nextQuarter, quarterAt, quarterIndex, quarterMonths, quarterNumber, type QuarterId } from '../simulation/quarters.ts';

/** How many quarters the game can play, from Q1 2194: Q1 and Q2 until the endless loop is built. */
export const PLAYABLE_QUARTERS = 2;
/** A quarter the game can play today: one of the first PLAYABLE_QUARTERS. */
export function isQuarterId(value: unknown): value is QuarterId {
  return isQuarterName(value) && quarterIndex(value) < PLAYABLE_QUARTERS;
}
/** The quarters the game can play today, in order. */
export const QUARTERS: readonly QuarterId[] = Array.from({ length: PLAYABLE_QUARTERS }, (_, i) => quarterAt(i));
/** The quarter to plan after `played` quarters, or null once the game can play no further. */
export function quarterAfter(played: number): QuarterId | null { return played < PLAYABLE_QUARTERS ? quarterAt(played) : null; }
/** The station's date after `played` quarters: the first day of the quarter that comes next. */
export function stationDate(played: number): string {
  const [year, q] = quarterAt(played).split('-Q');
  return `${year}-${String(3 * Number(q) - 2).padStart(2, '0')}-01`;
}
