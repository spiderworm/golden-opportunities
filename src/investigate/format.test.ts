import { describe, expect, it } from "vitest";
import { DIMENSION_LABELS, formatDimensionShort, formatDimensionValue, ledgersTitle, MEASURE_LABELS, periodLabel } from "./format";

describe("Plot's Investigate words (m1-copy section 2)", () => {
  it("names a span of quarters as the ledgers' title does", () => {
    expect(periodLabel(["2193-Q1", "2193-Q2", "2193-Q3", "2193-Q4"])).toBe("2193");
    expect(periodLabel(["2193-Q1", "2193-Q2", "2193-Q3", "2193-Q4", "2194-Q1"])).toBe("2193 and Q1 2194");
    expect(periodLabel(["2193-Q3"])).toBe("Q3 2193");
    expect(periodLabel(["2193-Q3", "2193-Q1", "2193-Q4"])).toBe("Q1 2193, Q3 2193 and Q4 2193");
  });

  it("says units sold, and an unknown title as one", () => {
    expect(MEASURE_LABELS.units).toBe("Units sold");
    expect(formatDimensionValue("title", null)).toBe("Unknown title");
    expect(formatDimensionValue("genre", null)).toBe("Unknown");
  });

  it("counts stars as a reader would: one star, five stars", () => {
    expect(formatDimensionValue("stars", "1")).toBe("1 star");
    expect(formatDimensionValue("stars", "5")).toBe("5 stars");
  });

  it("names award winners and books without an award", () => {
    expect(formatDimensionValue("awarded", "yes")).toBe("Award winner");
    expect(formatDimensionValue("awarded", "no")).toBe("No award");
    expect(DIMENSION_LABELS.awarded).toBe("Award winner");
  });

  it("names volumes, and books with none", () => {
    expect(formatDimensionValue("volume", "3")).toBe("Volume 3");
    expect(formatDimensionValue("volume", null)).toBe("No volume");
    expect(formatDimensionValue("in_series", "yes")).toBe("In a series");
    expect(formatDimensionValue("in_series", "no")).toBe("Not in a series");
  });
});

describe("the ledgers' title", () => {
  it("names the visible span, and falls back without data (Audit's probe on #59)", () => {
    expect(ledgersTitle({ options: { quarter: ["2193-Q1", "2193-Q2", "2193-Q3", "2193-Q4", "2194-Q1"] } })).toBe("Ledgers: 2193 and Q1 2194");
    expect(ledgersTitle(undefined)).toBe("Investigate");
    expect(ledgersTitle(null)).toBe("Investigate");
    expect(ledgersTitle({ options: { quarter: [] } })).toBe("Investigate");
  });
});

describe("month labels", () => {
  it("name the year in full, and in short whenever both years are in view", () => {
    expect(formatDimensionValue("month", "2194-01")).toBe("Jan 2194");
    expect(formatDimensionShort("month", "2193-03", ["2193-01", "2193-02", "2193-03"])).toBe("Mar");
    expect(formatDimensionShort("month", "2193-03", ["2193-03", "2194-03"])).toBe("Mar 2193");
    expect(formatDimensionShort("month", "2194-03", ["2193-03", "2194-03"])).toBe("Mar 2194");
  });
});
