// "% of total" and "Running share" (David, 3 Nov 2026, req_fa2e6a0dbbec: ""% of total" as a display mode, plus a
// cumulative-share curve ("the top 5 titles are X% of revenue")"; Plot's copy). Each group's share is of the query's
// own total, the one before the row limit, never the sum of the bars shown: a chart cut to its top titles, or a
// result the limit cut, would otherwise overstate every share. Worked out in the browser from what the chart has.
import type { EChartsCoreOption } from "echarts/core";
import type { Dimension, Measure } from "~/query/types";
import { chartTheme, tooltipStyle } from "~/platform/charts/chart-theme";
import { escapeHtml } from "~/platform/charts/escape";
import {
  formatDimensionShort,
  formatDimensionValue,
  formatMeasure,
  MEASURE_LABELS,
} from "../format";
import { GROUP_PLURALS, type Grouping } from "../state";
import { HORIZONTAL_ROW, type CategoryModel } from "./category-chart";

export interface ShareModel {
  measure: Measure;
  x: Dimension;
  /** In the chart's order, or largest first for the running share. */
  categories: (string | null)[];
  values: number[];
  /** Each one's share of the total, 0 to 1. */
  shares: number[];
  /** The running share up to and including each one, 0 to 1; only for the running share. */
  running: number[] | null;
  total: number;
  horizontal: boolean;
  /** Not every group is drawn (the top ones only, or the row limit cut some): the caption says so. */
  cut: boolean;
}

/** Null when there's no total to share out (nothing sold): the chart shows its figures instead. */
export function shareModel(
  model: CategoryModel,
  total: number | null,
  { running = false, truncated = false }: { running?: boolean; truncated?: boolean } = {},
): ShareModel | null {
  if (total === null || !(total > 0)) return null;
  let at = model.categories.map((_, i) => i);
  const values = model.series[0]?.values ?? [];
  // Largest first; ties keep the chart's order.
  if (running) at = [...at].sort((a, b) => (values[b] ?? 0) - (values[a] ?? 0));
  const shown = at.map((i) => values[i] ?? 0);
  const shares = shown.map((v) => v / total);
  let sum = 0;
  return {
    measure: model.measure,
    x: model.x,
    categories: at.map((i) => model.categories[i] ?? null),
    values: shown,
    shares,
    running: running ? shares.map((s) => (sum += s)) : null,
    total,
    horizontal: model.horizontal,
    cut: truncated || model.categories.length < model.ranked,
  };
}

/** A share as Plot writes it: one decimal place, "18.0%". */
export const formatShare = (share: number) => `${(share * 100).toFixed(1)}%`;

const plural = (x: Dimension) => GROUP_PLURALS[x as Grouping] ?? "groups";
const singular = (x: Dimension) => formatDimensionLabel(x);
const measureWord = (measure: Measure) => MEASURE_LABELS[measure].toLowerCase();

/** "title", from "Titles": a grouping in the singular, lower case. */
function formatDimensionLabel(x: Dimension): string {
  const p = plural(x);
  return p.endsWith("s") ? p.slice(0, -1) : p;
}

/** "Top 5 titles: 62.3% of revenue", or with one, "Top title: 18.0% of revenue" (Plot). */
export function topLine(m: ShareModel, n: number): string {
  const share = m.running ? m.running[n - 1]! : m.shares.slice(0, n).reduce((a, b) => a + b, 0);
  const who = n === 1 ? `Top ${singular(m.x)}` : `Top ${n} ${plural(m.x)}`;
  return `${who}: ${formatShare(share)} of ${measureWord(m.measure)}`;
}

/** The headline under the title, David's "the top 5 titles are X% of revenue": the top 5, or all if fewer. */
export function headline(m: ShareModel): string | null {
  if (!m.running || m.running.length < 2) return null;
  return topLine(m, Math.min(5, m.running.length));
}

/** "Shares are of all titles, not only those shown.", when some groups aren't drawn (Plot). */
export const cutNote = (m: ShareModel) =>
  m.cut ? `Shares are of all ${plural(m.x)}, not only those shown.` : null;

/** The chart's title with its mode (Plot): "Revenue by title, largest first, with the running share". */
export const shareTitle = (base: string, running: boolean) =>
  running ? `${base}, largest first, with the running share` : `${base}, as shares`;

/** A bar's tooltip line: "Fiction: $38,420, 18.0% of revenue". */
export const barLine = (m: ShareModel, i: number) =>
  `${formatDimensionValue(m.x, m.categories[i])}: ${formatMeasure(m.measure, m.values[i]!)}, ${formatShare(m.shares[i]!)} of ${measureWord(m.measure)}`;

export const shareHeight = (m: ShareModel, height = 320) =>
  m.horizontal ? Math.max(height, m.categories.length * HORIZONTAL_ROW + 40) : height;

/**
 * The bars, as shares on a percent axis ("Share of revenue (%)"), and for the running share a line climbing toward
 * 100% on its own axis ("Running share (%)"). Selected groups stay highlighted, as on the figures' chart.
 */
export function shareOption(
  m: ShareModel,
  { selected = [], drill = true }: { selected?: readonly string[]; drill?: boolean } = {},
): EChartsCoreOption {
  const horizontal = m.horizontal;
  const anySelected = selected.length > 0;
  const percent = (v: number) => `${Math.round(v)}%`;
  const categoryAxis = {
    type: "category",
    data: m.categories.map((c) =>
      formatDimensionShort(
        m.x,
        c,
        m.categories.filter((k): k is string => k !== null),
      ),
    ),
    inverse: horizontal,
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
  // Each axis's name centred along it, clear of its labels: at an axis's end it was cut off by the chart's edge
  // (measured on the build, ranked titles).
  const axisName = {
    nameLocation: "middle",
    nameTextStyle: { color: chartTheme.textMuted, fontSize: 12 },
    nameGap: horizontal ? 26 : 46,
  };
  const valueAxis = {
    type: "value",
    name: `Share of ${measureWord(m.measure)} (%)`,
    ...axisName,
    min: 0,
    splitNumber: 4,
    axisLabel: { color: chartTheme.textMuted, fontSize: 12, formatter: percent },
    splitLine: { lineStyle: { color: chartTheme.grid, width: 1, type: "solid" } },
  };
  const runningAxis = {
    type: "value",
    name: "Running share (%)",
    ...axisName,
    min: 0,
    max: 100,
    interval: 25,
    axisLabel: { color: chartTheme.textMuted, fontSize: 12, formatter: percent },
    splitLine: { show: false },
  };
  const line = chartTheme.categorical[2];
  const valueAxes = m.running ? [valueAxis, runningAxis] : valueAxis;

  return {
    animationDuration: 400,
    animationDurationUpdate: 300,
    textStyle: { fontFamily: chartTheme.font },
    aria: { enabled: true },
    // Room outside the labels for the axes' names, which containLabel doesn't count.
    grid: horizontal
      ? { left: 8, right: 24, top: m.running ? 40 : 16, bottom: 30, containLabel: true }
      : { left: 28, right: m.running ? 28 : 16, top: 16, bottom: 4, containLabel: true },
    tooltip: {
      ...tooltipStyle,
      trigger: "axis",
      axisPointer: { type: "shadow", shadowStyle: { color: "rgb(143 132 255 / 0.08)" } },
      formatter: (all: { dataIndex: number }[]) => {
        const i = all[0]?.dataIndex;
        if (i === undefined) return "";
        const lines = [`<div><strong>${escapeHtml(barLine(m, i))}</strong></div>`];
        if (m.running)
          lines.push(`<div style="margin-top:4px">${escapeHtml(topLine(m, i + 1))}</div>`);
        const hint = !drill
          ? ""
          : anySelected && selected.includes(m.categories[i] ?? "")
            ? "Click to clear"
            : "Click to look closer";
        if (hint)
          lines.push(
            `<div style="font-size:11px;color:${chartTheme.textSubtle};margin-top:6px">${hint}</div>`,
          );
        return lines.join("");
      },
    },
    xAxis: horizontal ? valueAxes : categoryAxis,
    yAxis: horizontal ? categoryAxis : valueAxes,
    series: [
      {
        type: "bar",
        name: `Share of ${measureWord(m.measure)}`,
        barMaxWidth: horizontal ? 16 : 24,
        barCategoryGap: "40%",
        itemStyle: {
          color: chartTheme.series,
          borderRadius: horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0],
        },
        emphasis: { focus: "none" },
        data: m.shares.map((s, i) => ({
          value: s * 100,
          itemStyle: {
            color:
              anySelected && !selected.includes(m.categories[i] ?? "")
                ? chartTheme.dimmed
                : chartTheme.series,
          },
        })),
      },
      ...(m.running
        ? [
            {
              type: "line",
              name: "Running share",
              [horizontal ? "xAxisIndex" : "yAxisIndex"]: 1,
              data: m.running.map((r) => r * 100),
              lineStyle: { color: line, width: 2, cap: "round", join: "round" },
              itemStyle: { color: line, borderColor: chartTheme.surface, borderWidth: 2 },
              symbol: "circle",
              symbolSize: 7,
              showSymbol: m.categories.length <= 24,
              emphasis: { focus: "none" },
            },
          ]
        : []),
    ],
  };
}
