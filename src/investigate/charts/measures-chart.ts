// Several measures in one chart (David, 2 Nov 2026: "multiple data series in the same chart ... multiple labels on
// the y-axis, color-coded"): up to three, on at most two value axes, one per unit, each axis labeled and colored to
// match its measures. Over months or quarters each measure is a line; over anything else, grouped bars. The first
// measure sets the categories' order and, for titles, which ones are shown.
import type { EChartsCoreOption } from "echarts/core";
import { QUERY_LIMITS, type Dimension, type QueryResult } from "~/query/types";
import { chartTheme, tooltipStyle } from "~/platform/charts/chart-theme";
import { escapeHtml } from "~/platform/charts/escape";
import { formatDimensionShort, formatDimensionValue, formatMeasure, MEASURE_LABELS, WHOLE_TICKS } from "../format";
import { isTotal, MEASURE_UNITS, type ChartMeasure } from "../state";
import { categoryModel, TOP_RANKED, type CategoryModel } from "./category-chart";

/** Each measure's color, by its place in the chart: the validated categorical slots, in order. */
export const measureColor = (index: number) => chartTheme.categorical[index % chartTheme.categorical.length]!;

export interface MeasuresModel {
  x: Dimension;
  categories: (string | null)[];
  measures: { measure: ChartMeasure; color: string; axis: number; values: (number | null)[] }[];
  /** The value axes, one per unit, in the order the units first appear. */
  axes: { measures: ChartMeasure[]; color: string }[];
  horizontal: boolean;
  /** How many categories the first measure had before a ranking was cut to the top ones. */
  ranked: number;
  /** Lines over time, bars otherwise. */
  kind: "line" | "bar";
}

/** One model for several measures' results, aligned on the first measure's categories. */
export function measuresModel(
  results: readonly QueryResult[],
  measures: readonly ChartMeasure[],
  x: Dimension,
  allCategories: readonly string[] = [],
  { top, keep = [] }: { top?: number; keep?: readonly string[] } = {},
): MeasuresModel {
  const first: CategoryModel = categoryModel(results[0]!, x, null, allCategories, { top, keep });
  const others = results.slice(1).map((r) => categoryModel(r, x, null, allCategories));
  const units = [...new Set(measures.map((m) => MEASURE_UNITS[m]))];
  const axisOf = (m: ChartMeasure) => units.indexOf(MEASURE_UNITS[m]);
  const valuesFor = (index: number) => {
    if (index === 0) return first.series[0]!.values;
    const model = others[index - 1]!;
    // A category this measure's complete result lacks sold nothing: zero for a total, no value for an average.
    // The server says whether it left rows out; a result from before it did is judged by its row count.
    const { truncated, rows } = results[index]!;
    const complete = truncated === undefined ? rows.length < QUERY_LIMITS.rows : !truncated;
    const absent = complete && isTotal(measures[index]!) ? 0 : null;
    return first.categories.map((c) => {
      const at = model.categories.indexOf(c);
      return at < 0 ? absent : (model.series[0]!.values[at] ?? null);
    });
  };
  const series = measures.map((measure, i) => ({ measure, color: measureColor(i), axis: axisOf(measure), values: valuesFor(i) }));
  return {
    x,
    categories: first.categories,
    measures: series,
    axes: units.map((_, k) => {
      const on = series.filter((s) => s.axis === k);
      return { measures: on.map((s) => s.measure), color: on[0]!.color };
    }),
    horizontal: first.horizontal,
    ranked: first.ranked,
    kind: x === "month" || x === "quarter" ? "line" : "bar",
  };
}

/** The chart for several measures; `hidden` measures (turned off in the legend) aren't drawn, and their axes stay. */
export function measuresOption(
  model: MeasuresModel,
  { selected = [], hidden = [] }: { selected?: readonly string[]; hidden?: readonly ChartMeasure[] } = {},
): EChartsCoreOption {
  const anySelected = selected.length > 0;
  const isSelected = (i: number) => selected.includes(model.categories[i] ?? "");
  const horizontal = model.horizontal && model.kind === "bar";
  const shown = model.measures.filter((m) => !hidden.includes(m.measure));

  const categoryAxis = {
    type: "category",
    data: model.categories.map((c) => formatDimensionShort(model.x, c, model.categories.filter((k): k is string => k !== null))),
    inverse: horizontal,
    boundaryGap: model.kind === "bar",
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
    },
  };
  // One axis per unit: left (or bottom) for the first, right (or top) for the second, named and colored for the
  // measures it carries. Their ticks line up, so the grid lines are the first axis's only.
  const valueAxes = model.axes.map((axis, k) => ({
    type: "value",
    position: horizontal ? (k === 0 ? "bottom" : "top") : k === 0 ? "left" : "right",
    name: axis.measures.map((m) => MEASURE_LABELS[m]).join(" · "),
    nameLocation: "middle",
    nameGap: horizontal ? 28 : 56,
    nameTextStyle: { color: axis.color, fontSize: 12, fontWeight: 600 },
    splitNumber: 4,
    alignTicks: true,
    ...(axis.measures.every((m) => WHOLE_TICKS.includes(m)) ? { minInterval: 1 } : {}),
    axisLine: { show: true, lineStyle: { color: axis.color, width: 2 } },
    axisLabel: { color: axis.color, fontSize: 12, formatter: (v: number) => formatMeasure(axis.measures[0]!, v, { compact: true }) },
    splitLine: { show: k === 0, lineStyle: { color: chartTheme.grid, width: 1, type: "solid" } },
  }));

  return {
    animationDuration: 400,
    animationDurationUpdate: 300,
    textStyle: { fontFamily: chartTheme.font },
    aria: { enabled: true },
    grid: horizontal
      ? { left: 8, right: 24, top: model.axes.length > 1 ? 44 : 16, bottom: 36, containLabel: true }
      : // containLabel leaves room for the tick labels, not an axis's name: room for the second axis's, on the right.
        { left: 24, right: model.axes.length > 1 ? 40 : 16, top: 16, bottom: 4, containLabel: true },
    tooltip: {
      ...tooltipStyle,
      trigger: "axis",
      axisPointer:
        model.kind === "line"
          ? { type: "line", lineStyle: { color: chartTheme.axis, width: 1 } }
          : { type: "shadow", shadowStyle: { color: "rgb(143 132 255 / 0.08)" } },
      formatter: (params: { dataIndex: number; seriesIndex: number; value: number | null; color: string }[]) => {
        const at = params[0];
        if (!at) return "";
        const heading = escapeHtml(formatDimensionValue(model.x, model.categories[at.dataIndex]));
        const lines = params.map((p) => {
          const m = shown[p.seriesIndex]!;
          const key = `<span style="display:inline-block;width:10px;height:2px;margin-right:8px;vertical-align:middle;background:${m.color}"></span><span style="color:${chartTheme.textMuted}">${escapeHtml(MEASURE_LABELS[m.measure])}</span>`;
          return `<div style="display:flex;justify-content:space-between;gap:16px"><span>${key}</span><strong>${escapeHtml(formatMeasure(m.measure, p.value))}</strong></div>`;
        });
        const hint = anySelected && isSelected(at.dataIndex) ? "Click to clear" : "Click to look closer";
        return `<div style="font-size:12px;color:${chartTheme.textMuted};margin-bottom:4px">${heading}</div>${lines.join("")}<div style="font-size:11px;color:${chartTheme.textSubtle};margin-top:6px">${hint}</div>`;
      },
    },
    xAxis: horizontal ? valueAxes : categoryAxis,
    yAxis: horizontal ? categoryAxis : valueAxes,
    series: shown.map((m) => {
      const axisKey = horizontal ? "xAxisIndex" : "yAxisIndex";
      if (model.kind === "line") {
        return {
          type: "line",
          name: MEASURE_LABELS[m.measure],
          [axisKey]: m.axis,
          data: m.values,
          lineStyle: { color: m.color, width: 2, cap: "round", join: "round" },
          itemStyle: { color: m.color, borderColor: chartTheme.surface, borderWidth: 2 },
          symbol: "circle",
          symbolSize: 8,
          showSymbol: model.categories.length <= 24,
          emphasis: { focus: "none" },
        };
      }
      return {
        type: "bar",
        name: MEASURE_LABELS[m.measure],
        [axisKey]: m.axis,
        barMaxWidth: horizontal ? 12 : 20,
        barGap: "12%",
        barCategoryGap: "28%",
        itemStyle: { color: m.color, borderRadius: horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0] },
        emphasis: { focus: "none", itemStyle: { color: m.color } },
        data: m.values.map((value, i) => ({ value, itemStyle: { color: anySelected && !isSelected(i) ? chartTheme.dimmed : m.color } })),
      };
    }),
  };
}

/** Several measures' results as one table: a row per category, a column per measure, in the chart's order. */
export function measuresTable(model: MeasuresModel, results: readonly QueryResult[]): QueryResult {
  const dimension = results[0]!.columns[0]!;
  return {
    columns: [dimension, ...model.measures.map((m, i) => results[i]!.columns.at(-1)!)],
    rows: model.categories.map((c, row) => ({ [model.x]: c, ...Object.fromEntries(model.measures.map((m) => [m.measure, m.values[row] ?? null])) })),
    total: null,
    source: results.map((r) => r.source).join(" "),
  };
}

export { TOP_RANKED };
