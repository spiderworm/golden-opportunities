// Change decomposition (David, 3 Nov 2026: "A waterfall showing which genres, titles or editions drove a change in
// revenue, and optionally a price/volume/mix split"). Built from rows the query layer already gives: each period's
// revenue and units by the chosen group, run as plain queries, so a group that sold then but not now is still
// there (vs. same quarter last year leaves those out). Shared by the server and the browser, so it imports nothing
// but types and evidence.ts.
import { withinNoise } from "./evidence";
import type { Dimension, QueryResult } from "./types";

/** One period's results by the group: revenue, and units for the price/volume/mix split. */
export interface PeriodRows {
  revenue: QueryResult;
  units?: QueryResult;
}

/**
 * A change as price, volume and mix, which sum to it exactly. With Uᵢ a group's units, pᵢ its realized revenue per
 * unit (so a discount is a lower price), P̄ the average realized price, 0 then and 1 now, a group's change
 * U1ᵢ·p1ᵢ − U0ᵢ·p0ᵢ is
 *   price  = U1ᵢ·(p1ᵢ − p0ᵢ): the same books selling for more or less each;
 *   volume = (U1ᵢ − U0ᵢ)·P̄0: more or fewer books, at the old average price;
 *   mix    = (U1ᵢ − U0ᵢ)·(p0ᵢ − P̄0): the books gained or lost being pricier or cheaper than that average.
 * Summed over the groups these are Goldy's totals: volume (U1 − U0)·P̄0, mix U1·(Σ s1ᵢ·p0ᵢ − P̄0) and price
 * Σ U1ᵢ·(p1ᵢ − p0ᵢ). A new group has no price then, so its p0 is its p1: no price change, its units at the old
 * average as volume, and its price's distance from that average as mix. A group that's gone is the same backwards.
 */
export interface Split {
  price: number;
  volume: number;
  mix: number;
}

/** A group's change, from then to now. */
export interface GroupChange {
  /** The group's value; null is the unknown group (a book with no genre, say). */
  key: string | null;
  then: number;
  now: number;
  change: number;
  /** Whether the change is within noise (evidence.ts); null when it can't be judged, which makes no claim. */
  noise: boolean | null;
  /** Price, volume and mix, with the split on and possible. */
  split?: Split;
  /**
   * A group with no row then is `new`, one with no row now is `gone`: neither has a price change, which its split
   * line says in words rather than as a measured zero (Plot, #328).
   */
  presence?: "new" | "gone";
}

/** The two quarters a change runs between, and each one's rows. */
export interface DroveRows {
  then: string;
  now: string;
  thenRows: PeriodRows;
  nowRows: PeriodRows;
}

/** Why there's no price/volume/mix split, for the toggle's reason. */
export type SplitProblem = "no_units" | "nothing_then" | "truncated";

/** The waterfall: revenue then, the largest groups' changes, everything else's, and revenue now. */
export interface Waterfall {
  by: Dimension;
  then: number;
  now: number;
  /** The groups shown, largest change first (by size, ups and downs alike). */
  groups: GroupChange[];
  /** The rest of the change in one, with how many groups it holds; null when every group is shown. */
  rest: (Omit<GroupChange, "key"> & { count: number }) | null;
  /** With the split asked for: the whole change split, the groups' splits summed, or why it can't be. */
  split?: Split | { problem: SplitProblem };
}

/** How many groups get their own bar; the rest are one, "Everything else". */
export const WATERFALL_TOP = 8;

const measureOf = (result: QueryResult) => result.columns.at(-1)!.key;

/** A result's rows by their group, each with its figure and standard error. */
function rowsBy(result: QueryResult, by: Dimension) {
  const measure = measureOf(result);
  const rows = new Map<string | null, { value: number; se: number | null }>();
  result.rows.forEach((row, i) => {
    rows.set(row[by] ?? null, {
      value: (row[measure] as number | null) ?? 0,
      se: result.evidence?.rows[i]?.se ?? null,
    });
  });
  return rows;
}

const sumSplits = (splits: readonly Split[]): Split =>
  splits.reduce(
    (t, s) => ({ price: t.price + s.price, volume: t.volume + s.volume, mix: t.mix + s.mix }),
    { price: 0, volume: 0, mix: 0 },
  );

/** Whether a change is within noise of zero, from the two figures' standard errors. */
const noiseOf = (then: number, now: number, variance: number | null) =>
  variance === null
    ? null
    : withinNoise(
        null,
        { value: now, evidence: { n: 0, se: Math.sqrt(variance) } },
        { value: then, evidence: { n: 0, se: 0 } },
      );

/**
 * The waterfall from each period's revenue by `by`, and with `split`, each period's units too. The groups' changes
 * and the rest's always sum to now − then: the rest is whatever the shown groups don't account for, including
 * groups a row limit cut. Each split sums to its change, and the groups' splits to the whole's.
 */
export function waterfall(
  by: Dimension,
  then: PeriodRows,
  now: PeriodRows,
  { top = WATERFALL_TOP, split = false }: { top?: number; split?: boolean } = {},
): Waterfall {
  const r0 = rowsBy(then.revenue, by);
  const r1 = rowsBy(now.revenue, by);
  const total0 = then.revenue.total ?? 0;
  const total1 = now.revenue.total ?? 0;
  const truncated = !!(then.revenue.truncated || now.revenue.truncated);
  const splitting = split ? splitter(by, then, now, truncated) : null;
  const keys = [...new Set([...r0.keys(), ...r1.keys()])];
  const changes = keys.map((key) => {
    const a = r0.get(key) ?? { value: 0, se: 0 };
    const b = r1.get(key) ?? { value: 0, se: 0 };
    const variance = a.se === null || b.se === null ? null : a.se ** 2 + b.se ** 2;
    const change: GroupChange = {
      key,
      then: a.value,
      now: b.value,
      change: b.value - a.value,
      noise: noiseOf(a.value, b.value, variance),
      ...(!r0.has(key)
        ? { presence: "new" as const }
        : !r1.has(key)
          ? { presence: "gone" as const }
          : {}),
    };
    if (splitting && !("problem" in splitting)) change.split = splitting.of(key, change.change);
    return { change, variance };
  });
  // Largest first, by size; ties keep the groups' own order.
  changes.sort((p, q) => Math.abs(q.change.change) - Math.abs(p.change.change));
  const shown = changes.slice(0, top);
  const hidden = changes.slice(top);
  let rest: Waterfall["rest"] = null;
  if (hidden.length || truncated) {
    const restThen = total0 - shown.reduce((t, c) => t + c.change.then, 0);
    const restNow = total1 - shown.reduce((t, c) => t + c.change.now, 0);
    // The hidden groups' spread, when each has one and the row limit cut none.
    const variance =
      !truncated && hidden.every((c) => c.variance !== null)
        ? hidden.reduce((t, c) => t + c.variance!, 0)
        : null;
    rest = {
      then: restThen,
      now: restNow,
      change: restNow - restThen,
      count: hidden.length,
      noise: noiseOf(restThen, restNow, variance),
      ...(splitting &&
        !("problem" in splitting) && { split: sumSplits(hidden.map((c) => c.change.split!)) }),
    };
  }
  return {
    by,
    then: total0,
    now: total1,
    groups: shown.map((c) => c.change),
    rest,
    ...(splitting && {
      split: "problem" in splitting ? splitting : sumSplits(changes.map((c) => c.change.split!)),
    }),
  };
}

/** Each group's split, or why there's none: no units, nothing sold then, or a row limit that cut groups. */
function splitter(
  by: Dimension,
  then: PeriodRows,
  now: PeriodRows,
  truncated: boolean,
): { of: (key: string | null, change: number) => Split } | { problem: SplitProblem } {
  if (!then.units || !now.units) return { problem: "no_units" };
  if (truncated || then.units.truncated || now.units.truncated) return { problem: "truncated" };
  const units0 = then.units.total ?? 0;
  // With nothing sold then there's no price then to hold a change against.
  if (units0 === 0) return { problem: "nothing_then" };
  const average0 = (then.revenue.total ?? 0) / units0;
  const r0 = rowsBy(then.revenue, by);
  const r1 = rowsBy(now.revenue, by);
  const u0 = rowsBy(then.units, by);
  const u1 = rowsBy(now.units, by);
  return {
    of: (key, change) => {
      const sold0 = u0.get(key)?.value ?? 0;
      const sold1 = u1.get(key)?.value ?? 0;
      const p1 = sold1 > 0 ? (r1.get(key)?.value ?? 0) / sold1 : 0;
      const p0 = sold0 > 0 ? (r0.get(key)?.value ?? 0) / sold0 : p1;
      const volume = (sold1 - sold0) * average0;
      const mix = (sold1 - sold0) * (p0 - average0);
      // What's left is price, so the three sum to the change exactly; the tests hold it to U1·(p1 − p0).
      return { price: change - volume - mix, volume, mix };
    },
  };
}
