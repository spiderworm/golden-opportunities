// Two measures against each other, a point per group (David, 3 Nov 2026: "Scatter plots: two measures across one
// dimension"). The first measure runs along the bottom and the second up the side, each axis titled with its
// measure and unit; a point's tooltip names its group and both values, and the points carry no labels, which would
// overlap (Plot's copy, #291). It's drawn from the two measures' model (measuresModel), so its groups are the bar
// chart's: for titles and editions, the top ones by the first measure until the player shows them all.
import type { EChartsCoreOption } from "echarts/core";
import { chartTheme, tooltipStyle } from "~/platform/charts/chart-theme";
import { escapeHtml } from "~/platform/charts/escape";
import type { Measure } from "~/query/types";
import {
  DIMENSION_LABELS,
  formatDimensionValue,
  formatMeasure,
  MEASURE_LABELS,
  WHOLE_TICKS,
} from "../format";
import type { ChartMeasure } from "../state";
import type { MeasuresModel } from "./measures-chart";

/** The scatter plot's height: a square-ish plot reads a relation best, whatever the number of groups. */
export const SCATTER_HEIGHT = 360;

/** Each measure's unit, after its label on an axis: "Revenue ($)". Counts need none ("Units sold"). */
const UNITS: Partial<Record<Measure, string>> = {
  revenue: "$",
  avg_order_value: "$",
  avg_discount: "%",
  avg_rating: "stars",
};
export const axisTitle = (measure: Measure) =>
  UNITS[measure] ? `${MEASURE_LABELS[measure]} (${UNITS[measure]})` : MEASURE_LABELS[measure];

/** "Units sold against revenue, by title": the second measure against the first. */
export function scatterTitle(
  [first, second]: readonly ChartMeasure[],
  by: keyof typeof DIMENSION_LABELS,
): string {
  return `${MEASURE_LABELS[second!]} against ${MEASURE_LABELS[first!].toLowerCase()}, by ${DIMENSION_LABELS[by].toLowerCase()}`;
}

export interface ScatterPoint {
  /** The group, for the tooltip and a click to look closer. */
  category: string | null;
  x: number;
  y: number;
}

/** The groups with both measures: one with no value for either (an average with no sales) has no place to go. */
export function scatterPoints(model: MeasuresModel): ScatterPoint[] {
  const [across, up] = model.measures;
  if (!across || !up) return [];
  return model.categories.flatMap((category, index) => {
    const x = across.values[index];
    const y = up.values[index];
    return x === null || x === undefined || y === null || y === undefined
      ? []
      : [{ category, x, y }];
  });
}

export function scatterOption(
  model: MeasuresModel,
  { selected = [] }: { selected?: readonly string[] } = {},
): EChartsCoreOption {
  const [across, up] = model.measures as [
    MeasuresModel["measures"][number],
    MeasuresModel["measures"][number],
  ];
  const points = scatterPoints(model);
  const anySelected = selected.length > 0;
  const color = chartTheme.categorical[0]!;
  const axis = (measure: ChartMeasure, position: "bottom" | "left") => ({
    type: "value",
    position,
    name: axisTitle(measure),
    nameLocation: "middle",
    nameGap: position === "bottom" ? 32 : 56,
    nameTextStyle: { color: chartTheme.textMuted, fontSize: 12, fontWeight: 600 },
    splitNumber: 4,
    ...(WHOLE_TICKS.includes(measure) ? { minInterval: 1 } : {}),
    axisLine: { show: true, lineStyle: { color: chartTheme.axis } },
    axisTick: { show: false },
    axisLabel: {
      color: chartTheme.textMuted,
      fontSize: 12,
      formatter: (v: number) => formatMeasure(measure, v, { compact: true }),
    },
    splitLine: { lineStyle: { color: chartTheme.grid, width: 1, type: "solid" } },
  });
  return {
    animationDuration: 400,
    animationDurationUpdate: 300,
    textStyle: { fontFamily: chartTheme.font },
    aria: { enabled: true },
    // containLabel leaves room for the tick labels, not the side axis's title: room for it on the left, which short
    // ticks ("25K") would otherwise leave cut off.
    grid: { left: 48, right: 24, top: 16, bottom: 28, containLabel: true },
    tooltip: {
      ...tooltipStyle,
      trigger: "item",
      formatter: (params: { dataIndex: number }) => {
        const point = points[params.dataIndex];
        if (!point) return "";
        const heading = escapeHtml(formatDimensionValue(model.x, point.category));
        const line = (measure: ChartMeasure, value: number) =>
          `<div><span style="color:${chartTheme.textMuted}">${escapeHtml(MEASURE_LABELS[measure])}:</span> <strong>${escapeHtml(formatMeasure(measure, value))}</strong></div>`;
        const hint =
          anySelected && selected.includes(point.category ?? "")
            ? "Click to clear"
            : "Click to look closer";
        return `<div style="font-size:12px;margin-bottom:4px">${heading}</div>${line(across.measure, point.x)}${line(up.measure, point.y)}<div style="font-size:11px;color:${chartTheme.textSubtle};margin-top:6px">${hint}</div>`;
      },
    },
    xAxis: axis(across.measure, "bottom"),
    yAxis: axis(up.measure, "left"),
    series: [
      {
        type: "scatter",
        name: `${MEASURE_LABELS[up.measure]} against ${MEASURE_LABELS[across.measure]}`,
        symbolSize: 10,
        cursor: "pointer",
        emphasis: { focus: "none", scale: 1.4 },
        data: points.map((p) => ({
          value: [p.x, p.y],
          itemStyle: {
            color: anySelected && !selected.includes(p.category ?? "") ? chartTheme.dimmed : color,
            borderColor: chartTheme.surface,
            borderWidth: 1,
          },
        })),
      },
    ],
  };
}
