import type { EChartsCoreOption } from "echarts/core";

import { chartTheme, tooltipStyle } from "~/platform/charts/chart-theme";
import { escapeHtml } from "~/platform/charts/escape";
import { moneyShort, moneyText, RESULT_COPY } from "./copy";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2194-01" or "10" as "Jan" or "Oct". */
export function monthName(month: string): string {
  return MONTHS[Number(month.slice(-2)) - 1] ?? month;
}

export interface OutcomeSeries {
  /** The quarter's months, YYYY-MM. */
  months: string[];
  plan: number[];
  holdCourse: number[];
  /** The quarter before, by month ("10", "11", "12" for Q4 2193), drawn behind by position in the quarter. */
  reference: { month: string; revenue: number }[];
  /** Its legend: "Q4 2193 (for reference)" after Q1, "Q1 2194 (for reference)" after Q2. */
  referenceLabel?: string;
  /** Its year, for the tooltip: the months come bare. */
  referenceYear?: string;
}

/**
 * Emphasis: the plan in the accent, holding course in the secondary ink, and
 * Q4 2193 faint behind them. The legend is HTML (see Result).
 */
export const OUTCOME_COLORS = {
  plan: chartTheme.series,
  holdCourse: chartTheme.textMuted,
  reference: chartTheme.dimmed,
} as const;

export function outcomeOption(series: OutcomeSeries): EChartsCoreOption {
  const referenceLabel = series.referenceLabel ?? RESULT_COPY.lines.reference;
  const line = (name: string, data: number[], color: string, width: number, z: number) => ({
    type: "line",
    name,
    data,
    z,
    lineStyle: { color, width, cap: "round", join: "round" },
    itemStyle: { color, borderColor: chartTheme.surface, borderWidth: 2 },
    symbol: "circle",
    symbolSize: 8,
    emphasis: { focus: "none" },
  });

  return {
    animationDuration: 600,
    textStyle: { fontFamily: chartTheme.font },
    aria: { enabled: true },
    grid: { left: 8, right: 24, top: 16, bottom: 4, containLabel: true },
    tooltip: {
      ...tooltipStyle,
      trigger: "axis",
      axisPointer: { type: "line", lineStyle: { color: chartTheme.axis, width: 1 } },
      formatter: (
        params: { dataIndex: number; seriesName: string; value: number; color: string }[],
      ) => {
        const i = params[0]?.dataIndex ?? 0;
        const rows = params.map((p) => {
          // The reference line is a different month: name it.
          const ref = series.reference[i];
          const name =
            p.seriesName === referenceLabel && ref
              ? `${series.referenceYear ?? "2193"} ${monthName(ref.month)}`
              : p.seriesName;
          return `<div style="display:flex;justify-content:space-between;gap:16px"><span><span style="display:inline-block;width:10px;height:2px;margin-right:8px;vertical-align:middle;background:${p.color}"></span><span style="color:${chartTheme.textMuted}">${escapeHtml(name)}</span></span><strong>${escapeHtml(moneyText(p.value))}</strong></div>`;
        });
        return `<div style="font-size:12px;color:${chartTheme.textMuted};margin-bottom:4px">${escapeHtml(`2194 ${monthName(series.months[i] ?? "")}`)}</div>${rows.join("")}`;
      },
    },
    xAxis: {
      type: "category",
      data: series.months.map(monthName),
      boundaryGap: false,
      axisLine: { lineStyle: { color: chartTheme.axis } },
      axisTick: { show: false },
      axisLabel: { color: chartTheme.textMuted, fontSize: 12, margin: 12 },
    },
    yAxis: {
      type: "value",
      min: 0,
      splitNumber: 4,
      axisLabel: {
        color: chartTheme.textMuted,
        fontSize: 12,
        formatter: (v: number) => moneyShort(v),
      },
      splitLine: { lineStyle: { color: chartTheme.grid, width: 1, type: "solid" } },
    },
    series: [
      line(
        referenceLabel,
        series.reference.map((r) => r.revenue),
        OUTCOME_COLORS.reference,
        2,
        1,
      ),
      line(RESULT_COPY.lines.holdCourse, series.holdCourse, OUTCOME_COLORS.holdCourse, 2, 2),
      line(RESULT_COPY.lines.plan, series.plan, OUTCOME_COLORS.plan, 2, 3),
    ],
  };
}
