import type { EChartsCoreOption } from "echarts/core";
import { format as echartsFormat } from "echarts/core";
import type { QueryResult } from "~/query/types";
import { formatDimensionShort, formatDimensionValue, formatMeasure } from "../format";
import type { ChartMeasure, Grouping } from "../state";
import { chartTheme, quarterColor, tooltipStyle } from "./chart-theme";

export interface BarModel {
  /** Category values along the x axis, as the query returns them. */
  categories: (string | null)[];
  /** One series, or one per quarter when comparing. */
  series: { quarter: string | null; values: (number | null)[] }[];
}

export function barModel(result: QueryResult, by: Grouping, compare: boolean): BarModel {
  const categories: (string | null)[] = [];
  for (const row of result.rows) {
    const value = row[by] ?? null;
    if (!categories.includes(value)) categories.push(value);
  }
  const valueAt = (category: string | null, quarter: string | null, measure: ChartMeasure) => {
    const row = result.rows.find((r) => (r[by] ?? null) === category && (!compare || r.quarter === quarter));
    return row ? (row[measure] ?? null) : null;
  };
  const measure = result.columns.at(-1)!.key as ChartMeasure;
  const quarters = compare ? [...new Set(result.rows.map((r) => r.quarter ?? null))].sort() : [null];
  return {
    categories,
    series: quarters.map((quarter) => ({ quarter, values: categories.map((c) => valueAt(c, quarter, measure)) })),
  };
}

export function barOption(
  model: BarModel,
  { measure, by, selected, quarters }: { measure: ChartMeasure; by: Grouping; selected: readonly string[]; quarters: readonly string[] },
): EChartsCoreOption {
  const anySelected = selected.length > 0;
  const isSelected = (i: number) => selected.includes(model.categories[i] ?? "");
  const comparing = model.series.length > 1 || model.series[0]?.quarter !== null;
  const encode = echartsFormat.encodeHTML;

  return {
    animationDuration: 400,
    animationDurationUpdate: 300,
    textStyle: { fontFamily: chartTheme.font },
    aria: { enabled: true },
    grid: { left: 8, right: 8, top: comparing ? 44 : 16, bottom: 4, containLabel: true },
    legend: comparing
      ? {
          top: 0,
          right: 0,
          icon: "roundRect",
          itemWidth: 12,
          itemHeight: 12,
          itemGap: 16,
          textStyle: { color: chartTheme.textMuted, fontSize: 12 },
          selectedMode: false,
        }
      : undefined,
    tooltip: {
      ...tooltipStyle,
      trigger: "axis",
      axisPointer: { type: "shadow", shadowStyle: { color: "rgb(143 132 255 / 0.08)" } },
      formatter: (params: { dataIndex: number; seriesName: string; value: number | null; color: string }[]) => {
        const first = params[0];
        if (!first) return "";
        const heading = encode(formatDimensionValue(by, model.categories[first.dataIndex]));
        const lines = params.map((p) => {
          const key = comparing
            ? `<span style="display:inline-block;width:10px;height:2px;margin-right:8px;vertical-align:middle;background:${p.color}"></span><span style="color:${chartTheme.textMuted}">${encode(p.seriesName)}</span>`
            : "";
          return `<div style="display:flex;justify-content:space-between;gap:16px"><span>${key}</span><strong>${encode(formatMeasure(measure, p.value))}</strong></div>`;
        });
        const hint = isSelected(first.dataIndex) ? "Click to clear" : "Click to drill in";
        return `<div style="font-size:12px;color:${chartTheme.textMuted};margin-bottom:4px">${heading}</div>${lines.join("")}<div style="font-size:11px;color:${chartTheme.textSubtle};margin-top:6px">${hint}</div>`;
      },
    },
    xAxis: {
      type: "category",
      data: model.categories.map((c) => formatDimensionShort(by, c)),
      axisLine: { lineStyle: { color: chartTheme.axis } },
      axisTick: { show: false },
      axisLabel: {
        color: chartTheme.textMuted,
        fontSize: 12,
        margin: 12,
        interval: 0,
        hideOverlap: true,
        formatter: (label: string) => (label.length > 22 ? `${label.slice(0, 21)}…` : label),
      },
    },
    yAxis: {
      type: "value",
      splitNumber: 4,
      axisLabel: { color: chartTheme.textMuted, fontSize: 12, formatter: (v: number) => formatMeasure(measure, v, { compact: true }) },
      splitLine: { lineStyle: { color: chartTheme.grid, width: 1, type: "solid" } },
    },
    series: model.series.map((series) => {
      const color = series.quarter ? quarterColor(series.quarter, quarters) : chartTheme.series;
      return {
        type: "bar",
        name: series.quarter ? formatDimensionValue("quarter", series.quarter) : formatDimensionValue("quarter", null),
        barMaxWidth: 24,
        barGap: "12%",
        barCategoryGap: comparing ? "28%" : "40%",
        itemStyle: { color, borderRadius: [4, 4, 0, 0] },
        emphasis: { focus: "none", itemStyle: { color } },
        data: series.values.map((value, i) => ({
          value,
          itemStyle: { color: anySelected && !isSelected(i) ? chartTheme.dimmed : color },
        })),
      };
    }),
  };
}
