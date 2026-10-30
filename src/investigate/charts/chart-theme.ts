// Chart colors. ECharts draws to SVG and can't read CSS custom properties, so
// these mirror theme.css. The quarter ramp is validated as an ordinal ramp on
// the panel surface (dataviz validate_palette.js --ordinal --mode dark
// --surface #161c30): one hue, Q1 darkest to the latest quarter lightest.
export const chartTheme = {
  surface: "#161c30",
  text: "#f2f4ff",
  textMuted: "#9aa3c7",
  textSubtle: "#6c76a0",
  grid: "#232a45",
  axis: "#2a3254",
  tooltip: "#1d2440",
  /** A single series. */
  series: "#7b6cff",
  /** Bars the player hasn't drilled into, while something is selected. */
  dimmed: "#2c3358",
  quarterRamp: ["#4b43a8", "#6b5cff", "#9488ff", "#c4bdff"],
  /** Heatmap: from barely off the surface to the lightest violet. */
  heatRamp: ["#1f2547", "#36378a", "#6b5cff", "#c4bdff"],
  inkOnLight: "#0f1424",
  inkOnDark: "#f2f4ff",
  font: '"Inter", system-ui, sans-serif',
} as const;

/** The ramp step for each quarter, so a quarter keeps its color whatever else is shown. */
export function quarterColor(quarter: string, allQuarters: readonly string[]): string {
  const ramp = chartTheme.quarterRamp;
  const index = allQuarters.indexOf(quarter);
  // Latest quarters take the lightest steps.
  const step = ramp.length - (allQuarters.length - index);
  return ramp[Math.max(0, step)]!;
}

export const tooltipStyle = {
  backgroundColor: chartTheme.tooltip,
  borderColor: chartTheme.axis,
  borderWidth: 1,
  padding: [8, 12],
  textStyle: { color: chartTheme.text, fontFamily: chartTheme.font, fontSize: 13 },
  extraCssText: "border-radius: 12px; box-shadow: 0 12px 32px rgb(4 6 16 / 0.5);",
} as const;
