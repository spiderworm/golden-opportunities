import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  draftProblem,
  EMPTY_FORECAST,
  entryProblem,
  ForecastSection,
  forecastFields,
  forecastMeasures,
  parseAmount,
  type ForecastDraft,
  type ForecastHints,
} from "./ForecastSection";

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

const entry = (point: string, low: string, high: string) => ({ point, low, high });
const open = (over: Partial<ForecastDraft> = {}): ForecastDraft => ({
  ...EMPTY_FORECAST,
  open: true,
  ...over,
});

const hints: ForecastHints = {
  quarter: "2194-Q1",
  revenue: {
    previous: { quarter: "2193-Q4", value: 161525 },
    yearEarlier: { quarter: "2193-Q1", value: 94210 },
  },
  units: {
    previous: { quarter: "2193-Q4", value: 13093 },
    yearEarlier: { quarter: "2193-Q1", value: null },
  },
};

describe("the forecast's checks (Frank's reasons, Plot's lines)", () => {
  it("reads what players type as amounts", () => {
    expect(parseAmount("$140,000")).toBe(140000);
    expect(parseAmount(" 140000 ")).toBe(140000);
    expect(parseAmount("12.5")).toBe(12.5);
    expect(parseAmount("lots")).toBeNull();
    expect(parseAmount("")).toBeNull();
  });

  it("allows a measure left empty, and refuses one half done or out of order", () => {
    expect(entryProblem("revenue", entry("", "", ""))).toBeNull();
    expect(entryProblem("revenue", entry("140000", "130000", "150000"))).toBeNull();
    expect(entryProblem("revenue", entry("140000", "", "150000"))).toBe("partial");
    expect(entryProblem("revenue", entry("lots", "1", "2"))).toBe("number");
    expect(entryProblem("revenue", entry("-1", "-2", "0"))).toBe("negative");
    expect(entryProblem("revenue", entry("140000", "145000", "150000"))).toBe("low_above_point");
    expect(entryProblem("revenue", entry("160000", "130000", "150000"))).toBe("point_above_high");
    // Units are whole.
    expect(entryProblem("units", entry("12.5", "10", "15"))).toBe("number");
  });

  it("finds the first problem in the form's order, and none while it's closed", () => {
    const bad = open({ revenue: entry("1", "", ""), units: entry("x", "1", "2") });
    expect(draftProblem(bad)).toEqual({ field: "revenue", reason: "partial" });
    expect(draftProblem({ ...bad, open: false })).toBeNull();
    expect(draftProblem(open({ note: "x".repeat(501) }))).toEqual({
      field: "note",
      reason: "too_long",
    });
  });
});

describe("what the plan is sent with (Frank's fields)", () => {
  it("sends nothing while closed, and leaves out a measure left empty", () => {
    expect(forecastFields({ ...EMPTY_FORECAST, revenue: entry("1", "1", "1") })).toEqual({});
    expect(
      forecastFields(open({ revenue: entry("$140,000", "130,000", "150000"), note: "  Sale. " })),
    ).toEqual({ forecastRevenue: "140000,130000,150000", forecastNote: "Sale." });
    expect(forecastFields(open({ units: entry("13000", "12000", "15000") }))).toEqual({
      forecastUnits: "13000,12000,15000",
    });
  });

  it("names the measures forecast for analytics, never their values", () => {
    expect(
      forecastMeasures(
        open({ revenue: entry("1", "1", "1"), units: entry("2", "1", "3"), note: "why" }),
      ),
    ).toBe("revenue+units");
    expect(forecastMeasures(open())).toBe("");
  });
});

describe("the section (Plot's copy, section 10)", () => {
  it("closed, is its heading and Add a forecast: the skip", () => {
    const html = renderToString(
      <ForecastSection draft={EMPTY_FORECAST} onChange={() => {}} hints={hints} problem={null} />,
    );
    expect(text(html)).toBe("Your forecast (optional) Add a forecast");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("<input");
  });

  it("open, takes an expected figure and an 80% range for each, with the hints beside them, and a note", () => {
    const html = renderToString(
      <ForecastSection draft={open()} onChange={() => {}} hints={hints} problem={null} />,
    );
    const t = text(html);
    expect(t).toContain("Remove forecast");
    expect(t).toContain("you'd be surprised only 1 time in 5");
    expect(html).toContain('aria-label="Expected revenue"');
    expect(html).toContain('aria-label="Revenue, low end of the 80% range"');
    expect(html).toContain('aria-label="Units sold, high end of the 80% range"');
    expect(t).toContain("Q4 2193, the quarter before: $161,525");
    expect(t).toContain("Q1 2193, a year earlier: $94,210");
    expect(t).toContain("Q1 2193, a year earlier: not in the ledgers");
    expect(t).toContain("Why? (optional)");
    // Nothing pre-filled.
    expect(html.match(/<input[^>]*value=""/g)).toHaveLength(6);
  });

  it("says a problem by its field, and marks the field", () => {
    const html = renderToString(
      <ForecastSection
        draft={open({ units: entry("1", "", "") })}
        onChange={() => {}}
        hints={hints}
        problem={{ field: "units", reason: "partial" }}
      />,
    );
    expect(text(html)).toContain("Fill in all three for units sold, or leave them all empty.");
    expect(html.match(/aria-invalid="true"/g)).toHaveLength(3);
    expect(html).toContain('role="alert"');
  });
});
