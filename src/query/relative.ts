// Relative quarters in the quarter filter (David, 3 Nov 2026: approved "Agreed on all points"): tokens a chart, pin,
// report item or segment can hold in place of a dated quarter, so it moves on as the game is played. Resolved at
// query time against the periods the player can see, never the quarter being planned, which has no sales yet, and
// never one they haven't reached. Shared by the server and the browser, so it imports nothing but types.
import type { Query } from "./types";

/** The latest quarter with sales, the quarter before it, and the same quarter a year earlier (Plot's names). */
export const RELATIVE_QUARTERS = ["latest", "latest-1", "latest-4"] as const;
export type RelativeQuarter = (typeof RELATIVE_QUARTERS)[number];

export const isRelativeQuarter = (value: unknown): value is RelativeQuarter =>
  (RELATIVE_QUARTERS as readonly unknown[]).includes(value);

/** A quarter ("2194-Q1") moved by `by` quarters, back when negative. */
export function shiftQuarter(quarter: string, by: number): string {
  const index = Number(quarter.slice(0, 4)) * 4 + Number(quarter.slice(-1)) - 1 + by;
  return `${Math.floor(index / 4)}-Q${(index % 4) + 1}`;
}

/** How many quarters back a token is from the latest. */
const back = (token: RelativeQuarter) => (token === "latest" ? 0 : Number(token.split("-")[1]));

/**
 * A token's quarter: the newest of the periods the player can see (the latest quarter with sales), moved back. It
 * may be one the player can't see, such as the quarter before Q1 2193: then nothing matches it, and whoever shows
 * it says why (Plot's reasons). Null with no periods at all.
 */
export function resolveQuarter(token: RelativeQuarter, periods: readonly string[]): string | null {
  if (!periods.length) return null;
  const latest = [...periods].sort().at(-1)!;
  return shiftQuarter(latest, -back(token));
}

/** Whether a resolved quarter is one the player can see. */
export const isAvailable = (quarter: string | null, periods: readonly string[]) =>
  quarter !== null && periods.includes(quarter);

/**
 * A quarter filter's values with its tokens resolved, in order and without repeats, and what each token became, for
 * "Latest quarter: Q1 2194". A filter with no tokens comes back as it was, with nothing resolved.
 */
export function resolveQuarters(
  values: readonly string[],
  periods: readonly string[],
): { values: string[]; resolved: Partial<Record<RelativeQuarter, string | null>> } {
  const resolved: Partial<Record<RelativeQuarter, string | null>> = {};
  const out: string[] = [];
  for (const value of values) {
    const quarter = isRelativeQuarter(value) ? resolveQuarter(value, periods) : value;
    if (isRelativeQuarter(value)) resolved[value] = quarter;
    if (quarter !== null && !out.includes(quarter)) out.push(quarter);
  }
  return { values: out, resolved };
}

/**
 * A query with its quarter filter's tokens resolved: what's run, cached under, compared with last year and judged
 * for discoveries. The same query when it has none.
 */
export function resolveQuery(
  query: Query,
  periods: readonly string[],
): { query: Query; resolved: Partial<Record<RelativeQuarter, string | null>> | null } {
  const quarters = query.filter?.quarter;
  if (!quarters?.some(isRelativeQuarter)) return { query, resolved: null };
  const { values, resolved } = resolveQuarters(quarters, periods);
  // A token with no periods resolves to nothing; an empty filter would mean every quarter, so it matches none.
  const filter = { ...query.filter, quarter: values.length ? values : ["none"] };
  return { query: { ...query, filter }, resolved };
}
