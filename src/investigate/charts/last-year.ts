// "vs. same quarter last year" on a chart (Plot's copy, #291): the change's words, the table's extra columns, and
// last year as a lighter series beside this year's.
import { change, yearEarlier } from "~/query/last-year";
import type { Dimension, LastYear, Measure, QueryResult } from "~/query/types";
import { formatDimensionValue, formatMeasure } from "../format";
import type { CategoryModel } from "./category-chart";
import type { EvidenceUnit } from "~/query/evidence";
import { basedOnLine, bothCounts, bothLine, faded, noisy, rowNoisy, withNoise } from "./evidence";

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
/** Last year's evidence for the same row (src/query/evidence.ts). */
function lastYearEvidenceAt(result: QueryResult, x: Dimension, category: string | null) {
  const i = result.rows.findIndex((r) => (r[x] ?? null) === category);
  return i < 0 ? null : (result.lastYear?.evidence.rows[i] ?? null);
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
      {
        key: labels.quarter,
        values: model.series[0]?.values ?? [],
        ...(model.series[0]?.evidence && { evidence: model.series[0].evidence }),
      },
      {
        key: labels.before,
        values: lastYear.map((figure) => figure?.value ?? null),
        ...(result.lastYear?.evidence && {
          evidence: model.categories.map((c) => lastYearEvidenceAt(result, model.x, c)),
        }),
      },
    ],
    lastYear,
  };
}

/** The table's rows: the group, this quarter, last year, Δ and % change, as text. */
export function lastYearRows(
  result: QueryResult,
  by: Dimension,
  measure: Measure,
): {
  group: string;
  now: string;
  then: string;
  delta: string;
  percent: string;
  noise: boolean;
  /** For an average: both years' counts, `1,240 and 980 orders`, and whether either is too few to go on. */
  basedOn?: string;
  faded?: boolean;
}[] {
  const unit = result.evidence?.unit ?? null;
  return result.rows.map((row, i) => {
    const now = (row[measure] as number | null | undefined) ?? null;
    const before = result.lastYear?.rows[i] ?? null;
    const { delta, percent } = change(now, before);
    // Within noise goes after the change, or after Δ where there's no % (average discount) (Plot, #297).
    const noise = rowNoisy(result, i);
    const pct = formatPercent(measure, percent);
    return {
      group: formatDimensionValue(by, row[by] ?? null),
      now: now === null ? "None" : formatMeasure(measure, now),
      // No figure at all last year reads None (Plot, #291); a zero reads as the measure's zero.
      then:
        before === null || before.value === null ? "None" : formatMeasure(measure, before.value),
      delta: withNoise(formatDelta(measure, delta), noise && !pct),
      percent: withNoise(pct, noise),
      noise,
      ...(unit && evidenceOfRow(result, i, unit)),
    };
  });
}

/** An average row's Based on cell and fade, from this year's and last year's evidence (Plot, after #311). */
function evidenceOfRow(result: QueryResult, i: number, unit: EvidenceUnit) {
  const now = result.evidence?.rows[i];
  if (!now) return {};
  const before = result.lastYear?.evidence.rows[i] ?? null;
  return {
    basedOn: bothCounts(unit, now.n, before?.n ?? null),
    faded: faded(unit, now) || faded(unit, before),
  };
}

/** Whether a chart's category is within noise of last year's, from the two series' evidence. */
export function ghostNoisy(ghost: CategoryModel, i: number): boolean {
  const [now, before] = ghost.series;
  if (!now || !before) return false;
  return noisy(
    ghost.unit ?? null,
    { value: now.values[i] ?? null, evidence: now.evidence?.[i] },
    { value: before.values[i] ?? null, evidence: before.evidence?.[i] },
  );
}

/** The tooltip's line for an average's two counts, or null without them: `Based on 1,240 orders (Q1 2194) and 980 (Q1 2193)`. */
export function ghostBasedOn(
  ghost: CategoryModel,
  i: number,
  labels: LastYearLabels,
): string | null {
  const unit = ghost.unit ?? null;
  const now = ghost.series[0]?.evidence?.[i];
  const before = ghost.series[1]?.evidence?.[i];
  if (!unit || !now) return null;
  return before ? bothLine(unit, now.n, before.n, labels) : basedOnLine(unit, now.n);
}
