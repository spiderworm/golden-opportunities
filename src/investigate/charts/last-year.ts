// "vs. same quarter last year" on a chart (Plot's copy, #291): the change's words, the table's extra columns, and
// last year as a lighter series beside this year's.
import { change, yearEarlier } from "~/query/last-year";
import type { Dimension, LastYear, Measure, QueryResult } from "~/query/types";
import { formatDimensionValue, formatMeasure } from "../format";
import type { CategoryModel } from "./category-chart";

/** The two quarters' names: `Q1 2194` and `Q1 2193`, and in the legend, by month, the years `2194` and `2193`. */
export function lastYearLabels(quarter: string, by: Dimension) {
  const before = yearEarlier("quarter", quarter);
  return {
    quarter,
    before,
    now: formatDimensionValue("quarter", quarter),
    then: formatDimensionValue("quarter", before),
    legend:
      by === "month"
        ? [quarter.slice(0, 4), before.slice(0, 4)]
        : [formatDimensionValue("quarter", quarter), formatDimensionValue("quarter", before)],
  };
}
export type LastYearLabels = ReturnType<typeof lastYearLabels>;

const sign = (text: string, value: number, zero: string) =>
  text === zero ? text : `${value > 0 ? "+" : value < 0 ? "-" : ""}${text}`;

/** The difference: `+$2,300`, `-140`, and for average discount, points: `+2.3 pts`. Empty without one. */
export function formatDelta(measure: Measure, delta: number | null): string {
  if (delta === null) return "";
  if (measure === "avg_discount")
    return sign(`${Math.abs(delta * 100).toFixed(1)} pts`, delta, "0.0 pts");
  return sign(formatMeasure(measure, Math.abs(delta)), delta, formatMeasure(measure, 0));
}

/** The change: `+22.8%`, `-4.1%`, `0.0%`, or `New` from zero. Empty for average discount: a percent of a percent. */
export function formatPercent(measure: Measure, percent: number | "new" | null): string {
  if (percent === null || measure === "avg_discount") return "";
  if (percent === "new") return "New";
  return sign(`${Math.abs(percent * 100).toFixed(1)}%`, percent, "0.0%");
}

/** The tooltip's `Change: +$2,300 (+5.9%)`, or null when either figure is missing. */
export function changeLine(measure: Measure, now: number | null, before: LastYear): string | null {
  const { delta, percent } = change(now, before);
  if (delta === null) return null;
  const pct = formatPercent(measure, percent);
  return `Change: ${formatDelta(measure, delta)}${pct ? ` (${pct})` : ""}`;
}

/** Last year's figure for each row of a result with `lastYear`, by the row's group on the chart's axis. */
function lastYearAt(result: QueryResult, x: Dimension, category: string | null): LastYear {
  const i = result.rows.findIndex((r) => (r[x] ?? null) === category);
  return i < 0 ? null : (result.lastYear?.rows[i] ?? null);
}

/**
 * The chart with last year beside this year: two series, this year's quarter and last year's, over this year's
 * categories. A category with no row this year (a quiet month) has no last year to show.
 */
export function withLastYear(
  model: CategoryModel,
  result: QueryResult,
  labels: LastYearLabels,
): CategoryModel & { lastYear: LastYear[] } {
  const lastYear = model.categories.map((c) => lastYearAt(result, model.x, c));
  return {
    ...model,
    seriesBy: "quarter",
    series: [
      { key: labels.quarter, values: model.series[0]?.values ?? [] },
      { key: labels.before, values: lastYear.map((figure) => figure?.value ?? null) },
    ],
    lastYear,
  };
}

/** The table's rows: the group, this quarter, last year, Δ and % change, as text. */
export function lastYearRows(
  result: QueryResult,
  by: Dimension,
  measure: Measure,
): { group: string; now: string; then: string; delta: string; percent: string }[] {
  return result.rows.map((row, i) => {
    const now = (row[measure] as number | null | undefined) ?? null;
    const before = result.lastYear?.rows[i] ?? null;
    const { delta, percent } = change(now, before);
    return {
      group: formatDimensionValue(by, row[by] ?? null),
      now: now === null ? "None" : formatMeasure(measure, now),
      // No figure at all last year reads None (Plot, #291); a zero reads as the measure's zero.
      then:
        before === null || before.value === null ? "None" : formatMeasure(measure, before.value),
      delta: formatDelta(measure, delta),
      percent: formatPercent(measure, percent),
    };
  });
}
