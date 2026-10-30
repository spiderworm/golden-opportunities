import type { EChartsCoreOption } from "echarts/core";
import { format as echartsFormat } from "echarts/core";
import type { QueryResult } from "~/query/types";
import { formatDimensionShort, formatDimensionValue, formatMeasure } from "../format";
import type { ChartMeasure, Filters } from "../state";
import { chartTheme, tooltipStyle } from "./chart-theme";

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export interface HeatModel {
  months: string[];
  /** [monthIndex, weekdayIndex, value] */
  cells: [number, number, number | null][];
  min: number;
  max: number;
}

export function heatModel(result: QueryResult, measure: ChartMeasure): HeatModel {
  const months = [...new Set(result.rows.map((r) => r.month).filter((m): m is string => !!m))].sort();
  const cells: HeatModel["cells"] = [];
  for (const row of result.rows) {
    const x = months.indexOf(row.month ?? "");
    const y = WEEKDAYS.indexOf(row.weekday ?? "");
    if (x >= 0 && y >= 0) cells.push([x, y, row[measure] ?? null]);
  }
  const values = cells.map((c) => c[2]).filter((v): v is number => v !== null);
  return { months, cells, min: values.length ? Math.min(...values) : 0, max: values.length ? Math.max(...values) : 0 };
}

/** A cell is in the selection when it matches every weekday/month filter that's set. */
export function cellSelected(filters: Filters, weekday: string, month: string): boolean {
  return (!filters.weekday || filters.weekday.includes(weekday)) && (!filters.month || filters.month.includes(month));
}

export function heatmapOption(model: HeatModel, { measure, filters }: { measure: ChartMeasure; filters: Filters }): EChartsCoreOption {
  const anySelected = !!(filters.weekday || filters.month);
  const span = model.max - model.min || 1;
  const encode = echartsFormat.encodeHTML;

  return {
    animationDuration: 300,
    textStyle: { fontFamily: chartTheme.font },
    aria: { enabled: true },
    grid: { left: 4, right: 4, top: 4, bottom: 4, containLabel: true },
    tooltip: {
      ...tooltipStyle,
      trigger: "item",
      formatter: (p: { data: { value: [number, number, number | null] } }) => {
        const [x, y, value] = p.data.value;
        const heading = `${WEEKDAYS[y]}s in ${formatDimensionValue("month", model.months[x])}`;
        return `<div style="font-size:12px;color:${chartTheme.textMuted};margin-bottom:4px">${encode(heading)}</div><strong>${encode(formatMeasure(measure, value))}</strong>`;
      },
    },
    xAxis: {
      type: "category",
      data: model.months.map((m) => formatDimensionShort("month", m)),
      position: "bottom",
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: chartTheme.textMuted, fontSize: 12 },
      splitArea: { show: false },
    },
    yAxis: {
      type: "category",
      data: WEEKDAYS.map((d) => formatDimensionShort("weekday", d)),
      inverse: true,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: chartTheme.textMuted, fontSize: 12, margin: 12 },
    },
    visualMap: {
      show: false,
      min: model.min,
      max: model.max,
      dimension: 2,
      inRange: { color: [...chartTheme.heatRamp] },
    },
    series: [
      {
        type: "heatmap",
        data: model.cells.map(([x, y, value]) => {
          const light = value !== null && (value - model.min) / span > 0.75;
          const selected = cellSelected(filters, WEEKDAYS[y]!, model.months[x]!);
          return {
            value: [x, y, value],
            itemStyle: { opacity: anySelected && !selected ? 0.3 : 1 },
            // Dimmed cells fade with their labels, so they keep the light ink.
            label: { color: light && (selected || !anySelected) ? chartTheme.inkOnLight : chartTheme.inkOnDark },
          };
        }),
        label: {
          show: true,
          fontSize: 11,
          formatter: (p: { data: { value: [number, number, number | null] } }) => formatMeasure(measure, p.data.value[2], { compact: true }),
        },
        itemStyle: { borderColor: chartTheme.surface, borderWidth: 3, borderRadius: 8 },
        emphasis: { itemStyle: { borderColor: chartTheme.text, borderWidth: 2 } },
      },
    ],
  };
}
