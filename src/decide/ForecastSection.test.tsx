import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ForecastHints } from "~/forecast/forecast";
import {
  draftProblem,
  EMPTY_FORECAST,
  ForecastSection,
  forecastFields,
  type ForecastDraft,
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

describe("what the plan is sent with (Frank's fields)", () => {
  it("sends nothing while closed, and leaves out a measure left empty", () => {
    expect(forecastFields({ ...EMPTY_FORECAST, revenue: entry("1", "1", "1") })).toEqual({});
    expect(forecastFields(open())).toEqual({});
    expect(
      forecastFields(open({ revenue: entry("$140,000", "130,000", "150000"), note: "  Sale.\n " })),
    ).toEqual({ forecastRevenue: "$140000,130000,150000", forecastNote: "Sale." });
  });

  it("takes out thousands separators only: a decimal comma is refused, not read as a larger number", () => {
    expect(
      forecastFields(open({ revenue: entry("$1,234,567.50", "1,000,000", "2,000,000") })),
    ).toEqual({
      forecastRevenue: "$1234567.50,1000000,2000000",
    });
    const decimal = open({ revenue: entry("1234,50", "1000", "2000") });
    expect(forecastFields(decimal)).toEqual({ forecastRevenue: "1234,50,1000,2000" });
    expect(draftProblem(decimal, "2194-Q1")).toEqual({ field: "revenue", reason: "number" });
  });

  it("sends a half-filled measure as typed, so it's refused by its field rather than dropped", () => {
    expect(forecastFields(open({ units: entry("13000", "", "") }))).toEqual({
      forecastUnits: "13000,,",
    });
  });
});

describe("the browser's check is the door's (Frank's forecastFromForm)", () => {
  const q = "2194-Q1" as const;
  it("files a whole forecast, and none while closed", () => {
    expect(draftProblem(open({ revenue: entry("$140,000", "130,000", "150,000") }), q)).toBeNull();
    expect(draftProblem({ ...EMPTY_FORECAST, revenue: entry("x", "", "") }, q)).toBeNull();
  });

  it("names the field and Frank's reason", () => {
    expect(draftProblem(open({ revenue: entry("140000", "", "150000") }), q)).toEqual({
      field: "revenue",
      reason: "partial",
    });
    expect(draftProblem(open({ revenue: entry("lots", "1", "2") }), q)).toEqual({
      field: "revenue",
      reason: "number",
    });
    expect(draftProblem(open({ units: entry("12.5", "10", "15") }), q)).toEqual({
      field: "units",
      reason: "number",
    });
    expect(draftProblem(open({ revenue: entry("140000", "145000", "150000") }), q)).toEqual({
      field: "revenue",
      reason: "low_above_point",
    });
    expect(draftProblem(open({ revenue: entry("1", "1", "1"), note: "x".repeat(501) }), q)).toEqual(
      { field: "note", reason: "too_long" },
    );
    // Counted by code point, as the door counts it: 500 emoji is 500.
    expect(
      draftProblem(open({ revenue: entry("1", "1", "1"), note: "\u{1F4DA}".repeat(500) }), q),
    ).toBeNull();
  });
});

describe("the section (Plot's copy, section 10)", () => {
  it("closed, is its heading and Add a forecast: the skip", () => {
    const html = renderToString(
      <ForecastSection
        quarter="2194-Q1"
        draft={EMPTY_FORECAST}
        onChange={() => {}}
        hints={hints}
        problem={null}
      />,
    );
    expect(text(html)).toBe("Your forecast (optional) Add a forecast");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("<input");
  });

  it("open, takes an expected figure and an 80% range for each, with the hints beside them, and a note", () => {
    const html = renderToString(
      <ForecastSection
        quarter="2194-Q1"
        draft={open()}
        onChange={() => {}}
        hints={hints}
        problem={null}
      />,
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
        quarter="2194-Q1"
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
