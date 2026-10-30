import type { EChartsCoreOption } from "echarts/core";
import type { QueryResult } from "~/query/types";
import { formatDimensionShort, formatDimensionValue, formatMeasure, MEASURE_LABELS } from "../format";
import { isTotal, type ChartMeasure, type Grouping } from "../state";
import { chartTheme, quarterColor, tooltipStyle } from "./chart-theme";
import { escapeHtml } from "./escape";

export interface BarModel {
  /** Category values along the category axis, in drawing order. */
  categories: (string | null)[];
  /** One series, or one per quarter when comparing. */
  series: { quarter: string | null; values: (number | null)[] }[];
  /** Titles are many and unordered: they read best as ranked horizontal bars. */
  horizontal: boolean;
  /** How many categories the ranking had before it was cut to the top ones. */
  ranked: number;
}

/** Ranked charts show this many by default, plus anything the player has selected. */
export const TOP_RANKED = 15;

/** Rows per horizontal category, so a long title list grows the card instead of squeezing. */
export const HORIZONTAL_ROW = 26;

/**
 * @param allCategories every category the axis should show, sales or not (the
 *   months in scope), so a quiet month reads as zero instead of disappearing.
 */
export function barModel(
  result: QueryResult,
  by: Grouping,
  compare: boolean,
  allCategories: readonly string[] = [],
  { top, keep = [] }: { top?: number; keep?: readonly string[] } = {},
): BarModel {
  const measure = result.columns.at(-1)!.key as ChartMeasure;
  let categories: (string | null)[] = [...allCategories];
  for (const row of result.rows) {
    const value = row[by] ?? null;
    if (!categories.includes(value)) categories.push(value);
  }
  const valueAt = (category: string | null, quarter: string | null) => {
    const row = result.rows.find((r) => (r[by] ?? null) === category && (!compare || r.quarter === quarter));
    return row ? (row[measure] ?? null) : isTotal(measure) ? 0 : null;
  };

  const horizontal = by === "title";
  const ranked = categories.length;
  if (horizontal) {
    // Largest first; ties keep the query's order.
    categories = [...categories].sort((a, b) => (valueAt(b, null) ?? -Infinity) - (valueAt(a, null) ?? -Infinity));
    if (top !== undefined) categories = categories.filter((c, i) => i < top || keep.includes(c ?? ""));
  } else if (by === "month") {
    categories = [...categories].sort();
  } else if (by === "discount_rate") {
    categories = [...categories].sort((a, b) => parseFloat(a ?? "Infinity") - parseFloat(b ?? "Infinity"));
  }

  const quarters = compare ? [...new Set(result.rows.map((r) => r.quarter ?? null))].sort() : [null];
  return {
    categories,
    series: quarters.map((quarter) => ({ quarter, values: categories.map((c) => valueAt(c, quarter)) })),
    horizontal,
    ranked,
  };
}

export function barHeight(model: BarModel): number {
  return model.horizontal ? Math.max(320, model.categories.length * HORIZONTAL_ROW + 40) : 320;
}

export function barOption(
  model: BarModel,
  { measure, by, selected, quarters }: { measure: ChartMeasure; by: Grouping; selected: readonly string[]; quarters: readonly string[] },
): EChartsCoreOption {
  const anySelected = selected.length > 0;
  const isSelected = (i: number) => selected.includes(model.categories[i] ?? "");
  const comparing = model.series.some((s) => s.quarter !== null);

  const categoryAxis = {
    type: "category",
    data: model.categories.map((c) => formatDimensionShort(by, c)),
    inverse: model.horizontal,
    axisLine: { lineStyle: { color: chartTheme.axis } },
    axisTick: { show: false },
    axisLabel: {
      color: chartTheme.textMuted,
      fontSize: 12,
      margin: 12,
      interval: 0,
      hideOverlap: !model.horizontal,
      width: model.horizontal ? 220 : undefined,
      overflow: model.horizontal ? "truncate" : undefined,
      formatter: model.horizontal ? undefined : (label: string) => (label.length > 22 ? `${label.slice(0, 21)}…` : label),
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
      axisPointer: { type: "shadow", shadowStyle: { color: "rgb(143 132 255 / 0.08)" } },
      formatter: (params: { dataIndex: number; seriesName: string; value: number | null; color: string }[]) => {
        const first = params[0];
        if (!first) return "";
        const heading = escapeHtml(formatDimensionValue(by, model.categories[first.dataIndex]));
        const lines = params.map((p) => {
          const key = comparing
            ? `<span style="display:inline-block;width:10px;height:2px;margin-right:8px;vertical-align:middle;background:${p.color}"></span><span style="color:${chartTheme.textMuted}">${escapeHtml(p.seriesName)}</span>`
            : "";
          return `<div style="display:flex;justify-content:space-between;gap:16px"><span>${key}</span><strong>${escapeHtml(formatMeasure(measure, p.value))}</strong></div>`;
        });
        const hint = isSelected(first.dataIndex) ? "Click to clear" : "Click to drill in";
        return `<div style="font-size:12px;color:${chartTheme.textMuted};margin-bottom:4px">${heading}</div>${lines.join("")}<div style="font-size:11px;color:${chartTheme.textSubtle};margin-top:6px">${hint}</div>`;
      },
    },
    xAxis: model.horizontal ? valueAxis : categoryAxis,
    yAxis: model.horizontal ? categoryAxis : valueAxis,
    series: model.series.map((series) => {
      const color = series.quarter ? quarterColor(series.quarter, quarters) : chartTheme.series;
      return {
        type: "bar",
        name: series.quarter ? formatDimensionValue("quarter", series.quarter) : MEASURE_LABELS[measure],
        barMaxWidth: model.horizontal ? 16 : 24,
        barGap: "12%",
        barCategoryGap: comparing ? "28%" : "40%",
        // Rounded at the data end, square at the baseline.
        itemStyle: { color, borderRadius: model.horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0] },
        emphasis: { focus: "none", itemStyle: { color } },
        data: series.values.map((value, i) => ({
          value,
          itemStyle: { color: anySelected && !isSelected(i) ? chartTheme.dimmed : color },
        })),
      };
    }),
  };
}
