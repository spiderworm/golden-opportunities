// One query result drawn over a category axis, as bars or lines: the main
// chart, the title view, and charts pinned by the player or by Dewey all use it.
import type { EChartsCoreOption } from "echarts/core";
import {
  PRICE_BANDS,
  QUERY_LIMITS,
  type Dimension,
  type Measure,
  type QueryResult,
} from "~/query/types";
import {
  formatDimensionShort,
  formatDimensionValue,
  formatMeasure,
  MEASURE_LABELS,
  WHOLE_TICKS,
} from "../format";
import { isTotal } from "../state";
import { chartTheme, seriesColor, tooltipStyle } from "~/platform/charts/chart-theme";
import { escapeHtml } from "~/platform/charts/escape";
import { ratingRange, withinNoise, type Evidence, type EvidenceUnit } from "~/query/evidence";
import { basedOnLine, faded as tooFew, lowLine, noisy, rangeLine } from "./evidence";

export interface CategoryModel {
  measure: Measure;
  /** The dimension along the category axis. */
  x: Dimension;
  /** Category values along the axis, in drawing order. */
  categories: (string | null)[];
  /** The dimension that splits each category into series, if any. */
  seriesBy: Dimension | null;
  /**
   * One series, or one per value of seriesBy, with each value's evidence where the result has it (src/query/
   * evidence.ts): null for a value with no row.
   */
  series: { key: string | null; values: (number | null)[]; evidence?: (Evidence | null)[] }[];
  /** What an average is over, for its "Based on" line; null for other measures or a result without evidence. */
  unit?: EvidenceUnit | null;
  /** Many unordered categories (titles, authors, series) read best as ranked horizontal bars. */
  horizontal: boolean;
  /** How many categories there were before a ranking was cut to the top ones. */
  ranked: number;
}

/** How strongly last year's series is drawn beside this year's (last-year.ts). */
export const GHOST_OPACITY = 0.4;

/** Ranked charts show this many by default, plus anything the player has selected. */
export const TOP_RANKED = 15;

/** Height per horizontal category, so a long list grows the card instead of squeezing. */
export const HORIZONTAL_ROW = 26;

const RANKED_DIMENSIONS: readonly Dimension[] = ["title", "author", "series", "edition"];

function orderCategories(x: Dimension, categories: (string | null)[]): (string | null)[] {
  if (x === "month" || x === "quarter") return [...categories].sort();
  if (x === "discount_rate")
    return [...categories].sort(
      (a, b) => parseFloat(a ?? "Infinity") - parseFloat(b ?? "Infinity"),
    );
  // "$12.99": cheapest first.
  if (x === "list_price")
    return [...categories].sort(
      (a, b) => parseFloat(a?.slice(1) ?? "Infinity") - parseFloat(b?.slice(1) ?? "Infinity"),
    );
  if (x === "price_band") {
    const at = (c: string | null) =>
      c === null ? Infinity : (PRICE_BANDS as readonly string[]).indexOf(c);
    return [...categories].sort((a, b) => at(a) - at(b));
  }
  return categories;
}

/**
 * @param seriesBy a second dimension to split each category by, such as quarter.
 * @param allCategories every category the axis should show whether anything
 *   sold or not (the months in scope), so a quiet month reads as zero.
 * @param top for ranked charts, keep only the largest this many, plus `keep`.
 * @param limit the query's row limit. A result that reached it may be missing
 *   rows, so absent pairs show as no bar rather than as a zero: a zero always
 *   means "sold nothing", never "not shown".
 */
export function categoryModel(
  result: QueryResult,
  x: Dimension,
  seriesBy: Dimension | null = null,
  allCategories: readonly string[] = [],
  {
    top,
    keep = [],
    limit = QUERY_LIMITS.rows,
  }: { top?: number; keep?: readonly string[]; limit?: number } = {},
): CategoryModel {
  const measure = result.columns.at(-1)!.key as Measure;
  const complete = result.rows.length < limit;
  // Only a complete result can say a category sold nothing.
  let categories: (string | null)[] = complete ? [...allCategories] : [];
  for (const row of result.rows) {
    const value = row[x] ?? null;
    if (!categories.includes(value)) categories.push(value);
  }
  const seriesKeys = seriesBy
    ? orderCategories(seriesBy, [...new Set(result.rows.map((r) => r[seriesBy] ?? null))])
    : [null];
  const rowAt = (category: string | null, key: string | null) =>
    result.rows.findIndex(
      (r) => (r[x] ?? null) === category && (!seriesBy || (r[seriesBy] ?? null) === key),
    );
  const valueAt = (category: string | null, key: string | null) => {
    const row = result.rows[rowAt(category, key)];
    return row ? (row[measure] ?? null) : complete && isTotal(measure) ? 0 : null;
  };
  const evidenceAt = (category: string | null, key: string | null) =>
    result.evidence?.rows[rowAt(category, key)] ?? null;
  const sum = (category: string | null) =>
    seriesKeys.reduce((total, key) => total + (valueAt(category, key) ?? 0), 0);

  const horizontal = RANKED_DIMENSIONS.includes(x);
  const ranked = categories.length;
  if (horizontal) {
    // Largest first; ties keep the query's order.
    categories = [...categories].sort((a, b) => sum(b) - sum(a));
    if (top !== undefined)
      categories = categories.filter((c, i) => i < top || keep.includes(c ?? ""));
  } else {
    categories = orderCategories(x, categories);
  }

  return {
    measure,
    x,
    categories,
    seriesBy,
    series: seriesKeys.map((key) => ({
      key,
      values: categories.map((c) => valueAt(c, key)),
      ...(result.evidence && { evidence: categories.map((c) => evidenceAt(c, key)) }),
    })),
    horizontal,
    ranked,
    unit: result.evidence?.unit ?? null,
  };
}

/**
 * Whether a chart has no sales to draw, so it shows its empty state ("No sales match") rather than an axis
 * ECharts makes up (0 to 1, which whole dollars read as "$0, $0, $1, $1, $1"). Each series is judged by its own
 * measure: a total of zero is no sales, but an average of zero is a figure (0% discount on full-price sales), so
 * it's drawn (Audit, #254). `measures` is each series' measure, or one for all of them.
 */
export function nothingToDraw(
  series: readonly { values: readonly (number | null)[] }[],
  measures: readonly Measure[],
): boolean {
  return series.every((s, i) => {
    const total = isTotal(measures[i] ?? measures[0]!);
    return s.values.every((v) => v === null || (total && v === 0));
  });
}

export function categoryHeight(model: CategoryModel, height = 320): number {
  return model.horizontal
    ? Math.max(height, model.categories.length * HORIZONTAL_ROW + 40)
    : height;
}

/** Series names and colors, for the HTML legend. Empty for a single series. */
export function legendItems(
  model: CategoryModel,
  quarters: readonly string[],
): { label: string; color: string }[] {
  if (!model.seriesBy) return [];
  return model.series.map((s, i) => ({
    label: formatDimensionValue(model.seriesBy!, s.key),
    color: seriesColor(model.seriesBy!, s.key, i, quarters),
  }));
}

export function categoryOption(
  model: CategoryModel,
  {
    kind = "bar",
    selected = [],
    quarters,
    drill = true,
    share,
    ghost,
  }: {
    kind?: "bar" | "line";
    selected?: readonly string[];
    quarters: readonly string[];
    drill?: boolean;
    /** For the tooltip's "{share}% of {period}": each series' whole and the period it covers. Omit to leave the line out. */
    share?: { total: (series: number) => number | null; period: (series: number) => string };
    /**
     * The second series is last year's (last-year.ts): drawn lighter in this year's color, with the tooltip's change
     * line for each category, or null for none.
     */
    /**
     * Last year beside this year: the tooltip's change line, and for an average both years' counts in one line
     * (Plot, after #311), which stands in for each series' own.
     */
    ghost?: {
      change: (category: number) => string | null;
      basedOn?: (category: number) => string | null;
    };
  },
): EChartsCoreOption {
  const { measure, x } = model;
  const anySelected = selected.length > 0;
  const isSelected = (i: number) => selected.includes(model.categories[i] ?? "");
  const splitting = model.seriesBy !== null;
  const horizontal = model.horizontal && kind === "bar";

  const categoryAxis = {
    type: "category",
    data: model.categories.map((c) =>
      formatDimensionShort(
        x,
        c,
        model.categories.filter((k): k is string => k !== null),
      ),
    ),
    inverse: horizontal,
    boundaryGap: kind === "bar",
    axisLine: { lineStyle: { color: chartTheme.axis } },
    axisTick: { show: false },
    axisLabel: {
      color: chartTheme.textMuted,
      fontSize: 12,
      margin: 12,
      interval: horizontal ? 0 : "auto",
      hideOverlap: !horizontal,
      width: horizontal ? 220 : undefined,
      overflow: horizontal ? "truncate" : undefined,
      formatter: horizontal
        ? undefined
        : (label: string) => (label.length > 22 ? `${label.slice(0, 21)}…` : label),
    },
  };
  const valueAxis = {
    type: "value",
    splitNumber: 4,
    // Counts and revenue never tick between whole numbers: "0.3 units" isn't a reading.
    ...(WHOLE_TICKS.includes(measure) ? { minInterval: 1 } : {}),
    axisLabel: {
      color: chartTheme.textMuted,
      fontSize: 12,
      formatter: (v: number) => formatMeasure(measure, v, { compact: true }),
    },
    splitLine: { lineStyle: { color: chartTheme.grid, width: 1, type: "solid" } },
  };

  return {
    animationDuration: 400,
    animationDurationUpdate: 300,
    textStyle: { fontFamily: chartTheme.font },
    aria: { enabled: true },
    grid: { left: 8, right: 16, top: 16, bottom: 4, containLabel: true },
    tooltip: {
      ...tooltipStyle,
      trigger: "axis",
      axisPointer:
        kind === "line"
          ? { type: "line", lineStyle: { color: chartTheme.axis, width: 1 } }
          : { type: "shadow", shadowStyle: { color: "rgb(143 132 255 / 0.08)" } },
      formatter: (
        all: {
          dataIndex: number;
          seriesIndex: number;
          seriesName: string;
          value: number | null;
          color: string;
        }[],
      ) => {
        // The likely range's own series say nothing here: each value's line says its range.
        const params = all.filter((p) => p.seriesIndex < model.series.length);
        const first = params[0];
        if (!first) return "";
        const heading = escapeHtml(formatDimensionValue(x, model.categories[first.dataIndex]));
        const lines = params.map((p) => {
          const key = splitting
            ? `<span style="display:inline-block;width:10px;height:2px;margin-right:8px;vertical-align:middle;background:${p.color}"></span><span style="color:${chartTheme.textMuted}">${escapeHtml(p.seriesName)}</span>`
            : "";
          const value = `<div style="display:flex;justify-content:space-between;gap:16px"><span>${key}</span><strong>${escapeHtml(formatMeasure(measure, p.value))}</strong></div>`;
          const total = share?.total(p.seriesIndex);
          const part =
            share && p.value !== null && total
              ? `<div style="font-size:11px;color:${chartTheme.textMuted}">${escapeHtml(`${Math.round((p.value / total) * 100)}% of ${share.period(p.seriesIndex)}`)}</div>`
              : "";
          return value + part + evidenceLines(model, p.seriesIndex, p.dataIndex, p.value, !ghost);
        });
        const hint = !drill
          ? ""
          : anySelected && isSelected(first.dataIndex)
            ? "Click to clear"
            : "Click to look closer";
        const changed = ghost?.change(first.dataIndex);
        const both = ghost?.basedOn?.(first.dataIndex);
        const changeLine = changed
          ? `<div style="margin-top:4px">${escapeHtml(changed)}</div>`
          : "";
        const hintLine = hint
          ? `<div style="font-size:11px;color:${chartTheme.textSubtle};margin-top:6px">${hint}</div>`
          : "";
        return `<div style="font-size:12px;color:${chartTheme.textMuted};margin-bottom:4px">${heading}</div>${lines.join("")}${changeLine}${both ? note(both) : ""}${hintLine}`;
      },
    },
    xAxis: horizontal ? valueAxis : categoryAxis,
    yAxis: horizontal ? categoryAxis : valueAxis,
    series: [
      ...model.series.map((series, index) => {
        // Last year is this year's color, lighter.
        const faded = ghost !== undefined && index === 1;
        const color = model.seriesBy
          ? seriesColor(
              model.seriesBy,
              model.series[faded ? 0 : index]!.key,
              faded ? 0 : index,
              quarters,
            )
          : chartTheme.series;
        const opacity = faded ? GHOST_OPACITY : 1;
        const name = model.seriesBy
          ? formatDimensionValue(model.seriesBy, series.key)
          : MEASURE_LABELS[measure];
        if (kind === "line") {
          return {
            type: "line",
            name,
            data: series.values,
            lineStyle: { color, width: 2, cap: "round", join: "round", opacity },
            itemStyle: { color, borderColor: chartTheme.surface, borderWidth: 2, opacity },
            symbol: "circle",
            symbolSize: 8,
            showSymbol: model.categories.length <= 24,
            emphasis: { focus: "none" },
          };
        }
        return {
          type: "bar",
          name,
          barMaxWidth: horizontal ? 16 : 24,
          barGap: "12%",
          barCategoryGap: splitting ? "28%" : "40%",
          // Rounded at the data end, square at the baseline.
          itemStyle: { color, opacity, borderRadius: horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0] },
          emphasis: { focus: "none", itemStyle: { color, opacity } },
          data: series.values.map((value, i) => ({
            value,
            itemStyle: {
              color: anySelected && !isSelected(i) ? chartTheme.dimmed : color,
              // An average over too few to go on is faded further (Plot, #296).
              opacity: tooFew(model.unit ?? null, series.evidence?.[i]) ? opacity * 0.45 : opacity,
            },
          })),
        };
      }),
      ...rangeSeries(model, kind, horizontal),
    ],
  };
}

const note = (text: string) =>
  `<div style="font-size:11px;color:${chartTheme.textMuted}">${escapeHtml(text)}</div>`;

/**
 * A value's evidence lines in the tooltip (Plot, #296 and #297): an average's `Based on 212 ratings` and its low-n
 * line, average rating's likely range, and, comparing quarters, `Within noise against Q1 2194` when its difference
 * from the quarter before it is (`comparing`: not when the series are this year and last).
 */
function evidenceLines(
  model: CategoryModel,
  seriesIndex: number,
  dataIndex: number,
  value: number | null,
  comparing: boolean,
): string {
  const series = model.series[seriesIndex];
  const evidence = series?.evidence?.[dataIndex];
  if (!series || !evidence) return "";
  const lines: string[] = [];
  if (model.unit && value !== null) {
    // Last year beside this year gives both counts in one line after the change.
    if (comparing) lines.push(basedOnLine(model.unit, evidence.n));
    const low = lowLine(model.unit, evidence.n);
    if (low) lines.push(low);
  }
  if (model.measure === "avg_rating") {
    const range = rangeLine(value, evidence);
    if (range) lines.push(range);
  }
  // Last year beside this year says it on its change line instead.
  const before =
    comparing && model.seriesBy === "quarter" ? model.series[seriesIndex - 1] : undefined;
  if (
    before &&
    noisy(
      model.unit ?? null,
      { value, evidence },
      { value: before.values[dataIndex] ?? null, evidence: before.evidence?.[dataIndex] },
    )
  )
    lines.push(`Within noise against ${formatDimensionValue("quarter", before.key)}`);
  return lines.map(note).join("");
}

/**
 * Comparing quarters: how many of the chart's quarter-on-quarter differences (each quarter against the one before,
 * in each category) can be judged, and how many of those are within noise.
 */
export function noiseFlags(model: CategoryModel): { compared: number; flagged: number } {
  let compared = 0;
  let flagged = 0;
  if (model.seriesBy !== "quarter") return { compared, flagged };
  model.series.forEach((series, s) => {
    const before = model.series[s - 1];
    if (!before) return;
    series.values.forEach((value, i) => {
      const a = { value, evidence: series.evidence?.[i] ?? null };
      const b = { value: before.values[i] ?? null, evidence: before.evidence?.[i] ?? null };
      const judged = withinNoise(model.unit ?? null, a, b);
      if (judged === null) return;
      compared++;
      if (judged) flagged++;
    });
  });
  return { compared, flagged };
}

/** Whether the chart draws average rating's likely range, so its legend names it. */
export const drawsRange = (model: CategoryModel) => rangeSeries(model, "bar", false).length > 0;

/** The unit of a chart's faded averages, for the caption under it, or null if nothing is faded. */
export function fadedUnit(model: CategoryModel): EvidenceUnit | null {
  const unit = model.unit ?? null;
  return model.series.some((s) => s.evidence?.some((e) => tooFew(unit, e))) ? unit : null;
}

/**
 * Average rating's likely range (95%) on an unsplit chart: a whisker on each bar, or a band along a line. A
 * category with fewer than two ratings has none. Split charts leave it to the tooltip: whiskers beside grouped bars
 * would have to find each bar's offset.
 */
function rangeSeries(model: CategoryModel, kind: "bar" | "line", horizontal: boolean) {
  const series = model.series[0];
  if (model.measure !== "avg_rating" || model.seriesBy || !series?.evidence) return [];
  const ranges = series.values.map((value, i) => {
    const evidence = series.evidence![i];
    return evidence ? ratingRange(value, evidence) : null;
  });
  if (!ranges.some(Boolean)) return [];
  if (kind === "line") {
    // A band: its lower edge as an invisible stacked line, and its width stacked on it, filled.
    const band = { type: "line", stack: "range", symbol: "none", silent: true, z: 1 };
    return [
      {
        ...band,
        name: "range-low",
        data: ranges.map((r) => r?.low ?? null),
        lineStyle: { opacity: 0 },
      },
      {
        ...band,
        name: "range-width",
        data: ranges.map((r) => (r ? r.high - r.low : null)),
        lineStyle: { opacity: 0 },
        areaStyle: { color: chartTheme.series, opacity: 0.18 },
      },
    ];
  }
  return [
    {
      type: "custom",
      name: "range",
      silent: true,
      z: 3,
      data: ranges.map((r, i) => [i, r?.low ?? NaN, r?.high ?? NaN]),
      encode: horizontal ? { x: [1, 2], y: 0 } : { x: 0, y: [1, 2] },
      renderItem: (
        _: unknown,
        api: { value: (dimension: number) => number; coord: (point: number[]) => number[] },
      ) => {
        const [i, low, high] = [api.value(0), api.value(1), api.value(2)];
        if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
        const at = (v: number) => api.coord(horizontal ? [v, i] : [i, v]);
        const [a, b] = [at(low), at(high)];
        const cap = (p: number[]) =>
          horizontal
            ? { x1: p[0]!, y1: p[1]! - 4, x2: p[0]!, y2: p[1]! + 4 }
            : { x1: p[0]! - 4, y1: p[1]!, x2: p[0]! + 4, y2: p[1]! };
        const style = { stroke: chartTheme.text, lineWidth: 1.5 };
        return {
          type: "group",
          children: [
            { type: "line", shape: { x1: a[0]!, y1: a[1]!, x2: b[0]!, y2: b[1]! }, style },
            { type: "line", shape: cap(a), style },
            { type: "line", shape: cap(b), style },
          ],
        };
      },
    },
  ];
}
