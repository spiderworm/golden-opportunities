// The quarters the game can play. Names and arithmetic are the simulation's (src/simulation/quarters.ts); with the
// endless loop (docs/design/endless.md) quarters run on past the two built so far, so PLAYABLE_QUARTERS says how
// many the game plays today. Plain relative imports only: store.server.ts runs under plain Node in its tests.
import { isQuarterName, quarterAt, quarterIndex, type QuarterId } from "../simulation/quarters.ts";

export {
  FIRST_QUARTER,
  compareQuarters,
  isQuarterName,
  nextQuarter,
  quarterAt,
  quarterIndex,
  quarterMonths,
  quarterNumber,
  type QuarterId,
} from "../simulation/quarters.ts";

/** How many quarters the game plays by default, from Q1 2194: Q1 and Q2 until every endless screen is in. */
export const PLAYABLE_QUARTERS = 400;
let playable = PLAYABLE_QUARTERS;
/** How many quarters the game can play now. */
export const playableQuarters = () => playable;
/** For tests: let the game play this many quarters, to exercise the endless loop before it's switched on. */
export function setPlayableQuarters(count: number) {
  playable = count;
}
/** A quarter the game can play: one of the first playableQuarters(). */
export function isQuarterId(value: unknown): value is QuarterId {
  return isQuarterName(value) && quarterIndex(value) < playable;
}
/** The quarter to plan after `played` quarters, or null once the game can play no further. */
export function quarterAfter(played: number): QuarterId | null {
  return played < playable ? quarterAt(played) : null;
}
/** The station's date after `played` quarters: the first day of the quarter that comes next. */
export function stationDate(played: number): string {
  const [year, q] = quarterAt(played).split("-Q");
  return `${year}-${String(3 * Number(q) - 2).padStart(2, "0")}-01`;
}
