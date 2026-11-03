// A game's quarters by name, from Q1 2194 on (docs/design/endless.md). Pure, with no game imports, so the
// simulation and Alma can use them; src/game/quarters.ts adds which quarters the game can play. Plain relative
// imports only: the save store runs under plain Node in its tests.

/** A quarter's name: "2194-Q1", "2195-Q3". */
export type QuarterId = `${number}-Q${1 | 2 | 3 | 4}`;

/** The first quarter a game plays. */
export const FIRST_QUARTER: QuarterId = "2194-Q1";

const NAME = /^(\d{4})-Q([1-4])$/;
const FIRST_YEAR = 2194;

/** A well-formed quarter name, at or after FIRST_QUARTER. */
export function isQuarterName(value: unknown): value is QuarterId {
  const match = typeof value === "string" ? NAME.exec(value) : null;
  return match !== null && Number(match[1]) >= FIRST_YEAR;
}
/** A quarter's place in the game: 0 for Q1 2194, 4 for Q1 2195. */
export function quarterIndex(quarter: QuarterId): number {
  const [, year, q] = NAME.exec(quarter)!;
  return (Number(year) - FIRST_YEAR) * 4 + Number(q) - 1;
}
/** The quarter at a place in the game (quarterIndex's inverse). */
export function quarterAt(index: number): QuarterId {
  return `${FIRST_YEAR + Math.floor(index / 4)}-Q${(index % 4) + 1}` as QuarterId;
}
/** The quarter after this one: Q4 2194 is followed by Q1 2195. */
export const nextQuarter = (quarter: QuarterId): QuarterId => quarterAt(quarterIndex(quarter) + 1);
/** For sorting: negative when `a` comes first. */
export const compareQuarters = (a: QuarterId, b: QuarterId): number =>
  quarterIndex(a) - quarterIndex(b);
/** A quarter's months, as YYYY-MM, in order. */
export function quarterMonths(period: QuarterId): string[] {
  const [year, q] = period.split("-Q");
  return [0, 1, 2].map((i) => `${year}-${String(3 * Number(q) - 2 + i).padStart(2, "0")}`);
}
/** The sale-line quarter number, 1 to 4. */
export function quarterNumber(period: QuarterId): number {
  return Number(period.slice(-1));
}
