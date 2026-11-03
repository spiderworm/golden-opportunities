import type { EChartsCoreOption } from "echarts/core";

import { chartTheme, tooltipStyle } from "~/platform/charts/chart-theme";
import { STRIKE_BELOW } from "~/simulation/strikes";
import { REPORTS_COPY as COPY } from "./copy";

/**
 * Overall score by quarter (reports.md section 1): a bar per played quarter, oldest first, and the strike line at 70
 * (endless.md section 7). A strike's bar is in the down colour, so it reads without the line.
 */
export function overallOption(rows: { label: string; score: number }[]): EChartsCoreOption {
  return {
    animation: false,
    textStyle: { fontFamily: chartTheme.font, color: chartTheme.textMuted },
    grid: { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
    tooltip: { trigger: "axis", ...tooltipStyle },
    xAxis: {
      type: "category",
      data: rows.map((r) => r.label),
      axisLine: { lineStyle: { color: chartTheme.axis } },
      axisTick: { show: false },
      axisLabel: { color: chartTheme.textMuted },
    },
    yAxis: {
      type: "value",
      min: 0,
      max: 100,
      interval: 25,
      splitLine: { lineStyle: { color: chartTheme.grid } },
      axisLabel: { color: chartTheme.textMuted },
    },
    series: [
      {
        type: "bar",
        name: COPY.overall,
        barMaxWidth: 48,
        data: rows.map((r) => ({
          value: r.score,
          itemStyle: { color: r.score < STRIKE_BELOW ? STRIKE_COLOR : chartTheme.series },
        })),
        markLine: {
          silent: true,
          symbol: "none",
          lineStyle: { color: chartTheme.textMuted, type: "dashed" },
          label: {
            formatter: COPY.strikeLine,
            position: "insideEndTop",
            color: chartTheme.textMuted,
          },
          data: [{ yAxis: STRIKE_BELOW }],
        },
      },
    ],
  };
}

/** The down colour: the theme's --color-down. */
const STRIKE_COLOR = "#ff7a90";
