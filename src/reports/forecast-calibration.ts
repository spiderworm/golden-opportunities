// How well the player's forecasts have done (David, 3 Nov 2026, req_6d136a2b7fb3: "add to reports how well they did
// against their own expectations and keep a running calibration"; Plot's copy, section 10; Frank's Calibration;
// Sim's statistics): the words and the chart, kept apart from the component so they can be checked without a page.
import type { EChartsCoreOption } from "echarts/core";

import { quarterName } from "~/decide/q2-copy";
import { chartTheme, tooltipStyle } from "~/platform/charts/chart-theme";
import { escapeHtml } from "~/platform/charts/escape";
import { moneyText } from "~/result/copy";
import type {
  Calibration,
  ForecastMeasure,
  ForecastResult,
  MeasureCalibration,
} from "~/forecast/forecast";

export const CALIBRATION_COPY = {
  heading: "Your forecasts",
  measures: { revenue: "Revenue", units: "Units sold" } satisfies Record<ForecastMeasure, string>,
  /** "3 of 5 quarters forecast"; "1 of 1 quarter forecast". */
  count: (forecast: number, played: number) =>
    forecast === 0
      ? "No quarter forecast yet: add one when you plan."
      : `${forecast} of ${played} ${played === 1 ? "quarter" : "quarters"} forecast`,
  hitRate: (hits: number, n: number) => `${hits} of ${n} inside your range (target: 4 in 5)`,
  hitRateTip:
    "How often the real figure landed inside your 80% range. Well calibrated is about 4 times in 5.",
  /** "You tend to forecast high, by 4.2% on average."; within ±2%, "No lean either way." */
  bias: (bias: number) =>
    Math.abs(bias) <= 0.02
      ? "No lean either way."
      : `You tend to forecast ${bias > 0 ? "high" : "low"}, by ${(Math.abs(bias) * 100).toFixed(1)}% on average.`,
  biasTip:
    "How far your expected figure was from the real one, on average. Above zero means you guessed high.",
  /** "Typical range: ±7.5% of your expected figure". */
  sharpness: (sharpness: number) =>
    `Typical range: ±${(sharpness * 100).toFixed(1)}% of your expected figure`,
  sharpnessTip:
    "How wide your ranges were, against your expected figure. Narrower is sharper, but only worth it if the hit rate holds.",
  tooFew: (n: number) => `Too few forecasts to judge yet: ${n} so far.`,
  chart: "Your forecasts against what happened",
  series: { expected: "Expected", range: "80% range", actual: "Actual" },
} as const;

/** One measure's lines, in order, each with its tooltip where it has one; only the count's before 3 forecasts. */
export function calibrationLines(m: MeasureCalibration): { text: string; tip?: string }[] {
  if (!m.judged) return [{ text: CALIBRATION_COPY.tooFew(m.n) }];
  const lines: { text: string; tip?: string }[] = [
    { text: CALIBRATION_COPY.hitRate(m.hits, m.n), tip: CALIBRATION_COPY.hitRateTip },
  ];
  if (m.bias !== null)
    lines.push({ text: CALIBRATION_COPY.bias(m.bias), tip: CALIBRATION_COPY.biasTip });
  // No sharpness line when every forecast's expected figure was 0 (Sim).
  if (m.sharpness !== null)
    lines.push({
      text: CALIBRATION_COPY.sharpness(m.sharpness),
      tip: CALIBRATION_COPY.sharpnessTip,
    });
  return lines;
}

const units = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
export const forecastAmount = (measure: ForecastMeasure, value: number) =>
  measure === "revenue" ? moneyText(value) : units.format(value);

/**
 * The chart for one measure: each forecast quarter's 80% range as a band, the expected figure as a line along it,
 * and what happened as points, coloured by whether they landed inside. Only the quarters forecast for it.
 */
export function calibrationOption(
  measure: ForecastMeasure,
  history: readonly ForecastResult[],
): EChartsCoreOption | null {
  const rows = history.flatMap((h) => (h[measure] ? [{ quarter: h.quarter, r: h[measure]! }] : []));
  if (!rows.length) return null;
  const s = CALIBRATION_COPY.series;
  const band = chartTheme.categorical[0];
  const actual = chartTheme.categorical[2];
  const short = (v: number) =>
    measure === "revenue"
      ? `$${new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v)}`
      : new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v);
  return {
    animation: false,
    textStyle: { fontFamily: chartTheme.font },
    aria: { enabled: true },
    grid: { left: 8, right: 12, top: 12, bottom: 4, containLabel: true },
    tooltip: {
      ...tooltipStyle,
      trigger: "axis",
      formatter: (all: { dataIndex: number }[]) => {
        const i = all[0]?.dataIndex;
        const row = i === undefined ? undefined : rows[i];
        if (!row) return "";
        const { r } = row;
        const lines = [
          `${s.expected}: ${forecastAmount(measure, r.forecast.point)}`,
          `${s.range}: ${forecastAmount(measure, r.forecast.low)} to ${forecastAmount(measure, r.forecast.high)}`,
          `${s.actual}: ${forecastAmount(measure, r.actual)}`,
        ];
        return `<div style="font-size:12px;color:${chartTheme.textMuted};margin-bottom:4px">${escapeHtml(quarterName(row.quarter))}</div>${lines.map((l) => `<div>${escapeHtml(l)}</div>`).join("")}`;
      },
    },
    xAxis: {
      type: "category",
      data: rows.map((row) => quarterName(row.quarter)),
      axisLine: { lineStyle: { color: chartTheme.axis } },
      axisTick: { show: false },
      axisLabel: { color: chartTheme.textMuted, fontSize: 11 },
    },
    yAxis: {
      type: "value",
      scale: true,
      splitNumber: 3,
      axisLabel: { color: chartTheme.textMuted, fontSize: 11, formatter: short },
      splitLine: { lineStyle: { color: chartTheme.grid } },
    },
    series: [
      // The band: the low end, unseen, with the range stacked on it.
      {
        type: "line",
        name: "low",
        stack: "range",
        data: rows.map(({ r }) => r.forecast.low),
        lineStyle: { opacity: 0 },
        symbol: "none",
        silent: true,
        tooltip: { show: false },
      },
      {
        type: "line",
        name: s.range,
        stack: "range",
        data: rows.map(({ r }) => r.forecast.high - r.forecast.low),
        lineStyle: { opacity: 0 },
        areaStyle: { color: band, opacity: 0.22 },
        symbol: "none",
        silent: true,
      },
      {
        type: "line",
        name: s.expected,
        data: rows.map(({ r }) => r.forecast.point),
        lineStyle: { color: band, width: 1.5, type: "dashed" },
        itemStyle: { color: band },
        symbol: "none",
      },
      {
        type: "scatter",
        name: s.actual,
        data: rows.map(({ r }) => ({
          value: r.actual,
          // Inside the range, filled; outside it, hollow, so it reads without colour too.
          itemStyle:
            r.where === "inside"
              ? { color: actual }
              : { color: chartTheme.surface, borderColor: actual, borderWidth: 2 },
        })),
        symbolSize: 9,
        z: 3,
      },
    ],
  };
}
