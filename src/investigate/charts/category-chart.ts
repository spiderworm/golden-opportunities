// One query result drawn over a category axis, as bars or lines: the main
// chart, the title view, and charts pinned by the player or by Dewey all use it.
import type { EChartsCoreOption } from "echarts/core";
import { QUERY_LIMITS, type Dimension, type Measure, type QueryResult } from "~/query/types";
import { formatDimensionShort, formatDimensionValue, formatMeasure, MEASURE_LABELS } from "../format";
import { isTotal } from "../state";
import { chartTheme, seriesColor, tooltipStyle } from "~/platform/charts/chart-theme";
import { escapeHtml } from "~/platform/charts/escape";

export interface CategoryModel {
  measure: Measure;
  /** The dimension along the category axis. */
  x: Dimension;
  /** Category values along the axis, in drawing order. */
  categories: (string | null)[];
  /** The dimension that splits each category into series, if any. */
  seriesBy: Dimension | null;
  /** One series, or one per value of seriesBy. */
  series: { key: string | null; values: (number | null)[] }[];
  /** Many unordered categories (titles, authors, series) read best as ranked horizontal bars. */
  horizontal: boolean;
  /** How many categories there were before a ranking was cut to the top ones. */
  ranked: number;
}

/** Ranked charts show this many by default, plus anything the player has selected. */
export const TOP_RANKED = 15;

/** Height per horizontal category, so a long list grows the card instead of squeezing. */
export const HORIZONTAL_ROW = 26;

const RANKED_DIMENSIONS: readonly Dimension[] = ["title", "author", "series"];

function orderCategories(x: Dimension, categories: (string | null)[]): (string | null)[] {
  if (x === "month" || x === "quarter") return [...categories].sort();
  if (x === "discount_rate") return [...categories].sort((a, b) => parseFloat(a ?? "Infinity") - parseFloat(b ?? "Infinity"));
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
  { top, keep = [], limit = QUERY_LIMITS.rows }: { top?: number; keep?: readonly string[]; limit?: number } = {},
): CategoryModel {
  const measure = result.columns.at(-1)!.key as Measure;
  const complete = result.rows.length < limit;
  // Only a complete result can say a category sold nothing.
  let categories: (string | null)[] = complete ? [...allCategories] : [];
  for (const row of result.rows) {
    const value = row[x] ?? null;
    if (!categories.includes(value)) categories.push(value);
  }
  const seriesKeys = seriesBy ? orderCategories(seriesBy, [...new Set(result.rows.map((r) => r[seriesBy] ?? null))]) : [null];
  const valueAt = (category: string | null, key: string | null) => {
    const row = result.rows.find((r) => (r[x] ?? null) === category && (!seriesBy || (r[seriesBy] ?? null) === key));
    return row ? (row[measure] ?? null) : complete && isTotal(measure) ? 0 : null;
  };
  const sum = (category: string | null) => seriesKeys.reduce((total, key) => total + (valueAt(category, key) ?? 0), 0);

  const horizontal = RANKED_DIMENSIONS.includes(x);
  const ranked = categories.length;
  if (horizontal) {
    // Largest first; ties keep the query's order.
    categories = [...categories].sort((a, b) => sum(b) - sum(a));
    if (top !== undefined) categories = categories.filter((c, i) => i < top || keep.includes(c ?? ""));
  } else {
    categories = orderCategories(x, categories);
  }

  return {
    measure,
    x,
    categories,
    seriesBy,
    series: seriesKeys.map((key) => ({ key, values: categories.map((c) => valueAt(c, key)) })),
    horizontal,
    ranked,
  };
}

export function categoryHeight(model: CategoryModel, height = 320): number {
  return model.horizontal ? Math.max(height, model.categories.length * HORIZONTAL_ROW + 40) : height;
}

/** Series names and colors, for the HTML legend. Empty for a single series. */
export function legendItems(model: CategoryModel, quarters: readonly string[]): { label: string; color: string }[] {
  if (!model.seriesBy) return [];
  return model.series.map((s, i) => ({ label: formatDimensionValue(model.seriesBy!, s.key), color: seriesColor(model.seriesBy!, s.key, i, quarters) }));
}

export function categoryOption(
  model: CategoryModel,
  {
    kind = "bar",
    selected = [],
    quarters,
    drill = true,
    share,
  }: {
    kind?: "bar" | "line";
    selected?: readonly string[];
    quarters: readonly string[];
    drill?: boolean;
    /** For the tooltip's "{share}% of {period}": each series' whole and the period it covers. Omit to leave the line out. */
    share?: { total: (series: number) => number | null; period: (series: number) => string };
  },
): EChartsCoreOption {
  const { measure, x } = model;
  const anySelected = selected.length > 0;
  const isSelected = (i: number) => selected.includes(model.categories[i] ?? "");
  const splitting = model.seriesBy !== null;
  const horizontal = model.horizontal && kind === "bar";

  const categoryAxis = {
    type: "category",
    data: model.categories.map((c) => formatDimensionShort(x, c, model.categories.filter((k): k is string => k !== null))),
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
      formatter: horizontal ? undefined : (label: string) => (label.length > 22 ? `${label.slice(0, 21)}…` : label),
    },
  };
  const valueAxis = {
    type: "value",
    splitNumber: 4,
    axisLabel: { color: chartTheme.textMuted, fontSize: 12, formatter: (v: number) => formatMeasure(measure, v, { compact: true }) },
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
      formatter: (params: { dataIndex: number; seriesIndex: number; seriesName: string; value: number | null; color: string }[]) => {
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
          return value + part;
        });
        const hint = !drill ? "" : anySelected && isSelected(first.dataIndex) ? "Click to clear" : "Click to look closer";
        const hintLine = hint ? `<div style="font-size:11px;color:${chartTheme.textSubtle};margin-top:6px">${hint}</div>` : "";
        return `<div style="font-size:12px;color:${chartTheme.textMuted};margin-bottom:4px">${heading}</div>${lines.join("")}${hintLine}`;
      },
    },
    xAxis: horizontal ? valueAxis : categoryAxis,
    yAxis: horizontal ? categoryAxis : valueAxis,
    series: model.series.map((series, index) => {
      const color = model.seriesBy ? seriesColor(model.seriesBy, series.key, index, quarters) : chartTheme.series;
      const name = model.seriesBy ? formatDimensionValue(model.seriesBy, series.key) : MEASURE_LABELS[measure];
      if (kind === "line") {
        return {
          type: "line",
          name,
          data: series.values,
          lineStyle: { color, width: 2, cap: "round", join: "round" },
          itemStyle: { color, borderColor: chartTheme.surface, borderWidth: 2 },
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
        itemStyle: { color, borderRadius: horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0] },
        emphasis: { focus: "none", itemStyle: { color } },
        data: series.values.map((value, i) => ({
          value,
          itemStyle: { color: anySelected && !isSelected(i) ? chartTheme.dimmed : color },
        })),
      };
    }),
  };
}
