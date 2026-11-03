// The player's forecast on Decide (David, 3 Nov 2026, req_6d136a2b7fb3: "allow for players to write out, plan out
// their own expectations of their decisions (optionally)", then "Forecast revenue and total units with hints, values
// for previous quarter and same quarter previous year, displayed"). Plot's copy, chart-features-copy.md section 10.

export type ForecastMeasure = "revenue" | "units";

export const FORECAST_COPY = {
  heading: "Your forecast (optional)",
  add: "Add a forecast",
  remove: "Remove forecast",
  explain:
    "Say what you expect, and a range you're 80% sure of: wide enough that you'd be surprised only 1 time in 5 to see the real figure outside it.",
  measures: { revenue: "Revenue", units: "Units sold" } satisfies Record<ForecastMeasure, string>,
  expected: "Expected",
  range: "80% range",
  from: "From",
  to: "To",
  /** The fields' accessible names, which say which measure and which end. */
  names: (measure: ForecastMeasure) => {
    const m = FORECAST_COPY.measures[measure];
    return {
      point: `Expected ${m.toLowerCase()}`,
      low: `${m}, low end of the 80% range`,
      high: `${m}, high end of the 80% range`,
    };
  },
  /** "Q4 2193, the quarter before: $161,525"; "…a year earlier: not in the ledgers". */
  hintBefore: (quarter: string, value: string | null) =>
    `${quarter}, the quarter before: ${value ?? "not in the ledgers"}`,
  hintYearEarlier: (quarter: string, value: string | null) =>
    `${quarter}, a year earlier: ${value ?? "not in the ledgers"}`,
  note: "Why? (optional)",
  notePlaceholder: "What you expect to move these, in a line or two.",
  /** Plot's line for each of Frank's reasons (forecastProblem.reason). */
  problems: {
    number: () => "Enter a number.",
    negative: (measure: ForecastMeasure) =>
      measure === "revenue" ? "Revenue can't be below $0." : "Units sold can't be below 0.",
    too_large: () => "That's more than this shop could sell in a quarter.",
    low_above_point: () => "The low end can't be above your expected figure.",
    point_above_high: () => "Your expected figure can't be above the high end.",
    partial: (measure: ForecastMeasure) =>
      `Fill in all three for ${FORECAST_COPY.measures[measure].toLowerCase()}, or leave them all empty.`,
    too_long: () => "Keep the note to 500 characters.",
    // A note with control characters, as the segment and report refusals put it.
    invalid: () => "This note can't be saved. Check it and try again.",
  },
} as const;

export const NOTE_MAX = 500;
