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
  /**
   * Series that aren't quarters: the dataviz reference's dark categorical
   * slots, in their fixed order. Validated on the panel surface
   * (validate_palette.js --mode dark --surface #161c30: all checks pass).
   */
  categorical: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"],
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

/** Most series a chart colors; past this, show a table instead of generating hues. */
export const MAX_SERIES = chartTheme.categorical.length;

/**
 * A series' color. Quarters take the ordinal violet ramp; anything else takes
 * the categorical slots in order of appearance.
 */
export function seriesColor(dimension: string, key: string | null, index: number, quarters: readonly string[]): string {
  if (dimension === "quarter" && key) return quarterColor(key, quarters);
  return chartTheme.categorical[index % chartTheme.categorical.length]!;
}

export const tooltipStyle = {
  backgroundColor: chartTheme.tooltip,
  borderColor: chartTheme.axis,
  borderWidth: 1,
  padding: [8, 12],
  textStyle: { color: chartTheme.text, fontFamily: chartTheme.font, fontSize: 13 },
  extraCssText: "border-radius: 12px; box-shadow: 0 12px 32px rgb(4 6 16 / 0.5);",
} as const;

/** The heat ramp's color at t (0 to 1), interpolated between its stops in sRGB. */
export function heatColor(t: number): string {
  const stops = chartTheme.heatRamp.map((hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)));
  const scaled = Math.min(Math.max(t, 0), 1) * (stops.length - 1);
  const i = Math.min(Math.floor(scaled), stops.length - 2);
  const f = scaled - i;
  const rgb = stops[i]!.map((c, k) => Math.round(c + (stops[i + 1]![k]! - c) * f));
  return `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}
