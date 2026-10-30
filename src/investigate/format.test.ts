import { describe, expect, it } from "vitest";
import { formatDimensionValue, MEASURE_LABELS, periodLabel } from "./format";

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
});
