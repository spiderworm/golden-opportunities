// "vs. same quarter last year": a query's figures beside the same query a year earlier (David, 3 Nov 2026).
// Shared by the server, which runs it, and the browser, which says when it can't and draws the change, so it
// imports nothing but types.
import type { Dimension, LastYear, Query } from "./types";

/** A quarter ("2194-Q1") or a month ("2194-03") a year earlier; any other dimension's value is the same a year on. */
export function yearEarlier(dimension: Dimension, value: string): string {
  if (dimension !== "quarter" && dimension !== "month") return value;
  return `${Number(value.slice(0, 4)) - 1}${value.slice(4)}`;
}

/** The quarter ("2194-Q1") a month ("2194-03") is in. */
export const quarterOfMonth = (month: string) =>
  `${month.slice(0, 4)}-Q${Math.ceil(Number(month.slice(5, 7)) / 3)}`;

/**
 * The quarters a figure covers: a row grouped by quarter or month covers its own; otherwise the periods the
 * query's quarter and month filters allow (every period, without them).
 */
export function quartersCovered(
  query: Pick<Query, "filter">,
  periods: readonly string[],
  row: Partial<Record<Dimension, string | null>> = {},
): string[] {
  if (row.quarter) return [row.quarter];
  if (row.month) return [quarterOfMonth(row.month)];
  const quarters = query.filter?.quarter;
  const months = query.filter?.month;
  return periods.filter(
    (q) =>
      (!quarters || quarters.includes(q)) &&
      (!months || months.some((m) => quarterOfMonth(m) === q)),
  );
}

/**
 * Why a figure over these quarters has no last year, or null if it has one: every quarter a year earlier must be
 * in the periods the player can see. Nothing earlier than 2193 exists, and a quarter outside the view isn't shown.
 */
export function lastYearMissing(
  quarters: readonly string[],
  periods: readonly string[],
): "nothing" | "before" | null {
  if (!quarters.length) return "nothing";
  return quarters.every((q) => periods.includes(yearEarlier("quarter", q))) ? null : "before";
}

/** The query a year earlier: the same measure, breakdown and filters, its quarter and month filters a year back. */
export function lastYearQuery(query: Query): Query {
  const filter = Object.fromEntries(
    Object.entries(query.filter ?? {}).map(([dimension, values]) => [
      dimension,
      values.map((v) => yearEarlier(dimension as Dimension, v)),
    ]),
  );
  const { vs: _vs, sort: _sort, limit: _limit, ...rest } = query;
  return { ...rest, ...(query.filter ? { filter } : {}) };
}

/**
 * A figure against last year's: the difference, and the change as a fraction of last year's (0.25 is 25% up).
 * The change is "new" when last year's was zero (never Infinity), and null when either figure has no value: last
 * year outside the data, or an average over no sales.
 */
export function change(
  now: number | null,
  before: LastYear,
): { delta: number | null; percent: number | "new" | null } {
  if (now === null || before === null || before.value === null)
    return { delta: null, percent: null };
  const delta = now - before.value;
  if (before.value === 0) return { delta, percent: now === 0 ? 0 : "new" };
  return { delta, percent: delta / Math.abs(before.value) };
}
