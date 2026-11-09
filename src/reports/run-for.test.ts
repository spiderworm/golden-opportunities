import { describe, expect, it } from "vitest";
import type { PinSpec } from "../investigate/pins/spec";
import { moveChart, newestQuarter, runOffset, runQuarter } from "./run-for";

const quarters = ["2193-Q1", "2193-Q2", "2193-Q3", "2193-Q4", "2194-Q1"];
const chart = (filter: Record<string, string[]>, measure = "revenue"): PinSpec =>
  ({ title: "Chart", kind: "bar", query: { measure, by: ["genre"], filter } }) as PinSpec;

describe("running a report for another quarter (Plot, section 9)", () => {
  it("runs for a played quarter or a relative one as it is now; As saved runs for none", () => {
    expect(runQuarter("saved", quarters)).toBeNull();
    expect(runQuarter("2193-Q3", quarters)).toBe("2193-Q3");
    expect(runQuarter("latest-1", quarters)).toBe("2193-Q4");
    // A year before the ledgers' first year: none.
    expect(runQuarter("latest-4", ["2193-Q1", "2193-Q2"])).toBeNull();
  });

  it("counts from the report's newest quarter, whatever names it", () => {
    const comparison: PinSpec = {
      title: "Q3 against Q4",
      kind: "comparison",
      comparison: { measure: "revenue", across: "quarter", from: "2193-Q3", to: "2193-Q4", by: [] },
    };
    expect(newestQuarter([chart({ quarter: ["2193-Q2"] }), comparison], quarters)).toBe("2193-Q4");
    expect(newestQuarter([chart({ quarter: ["latest"] })], quarters)).toBe("2194-Q1");
    expect(newestQuarter([chart({ month: ["2193-11"] })], quarters)).toBe("2193-Q4");
    expect(newestQuarter([chart({})], quarters)).toBeNull();
    expect(runOffset("2193-Q4", "2194-Q1")).toBe(1);
    expect(runOffset("2194-Q1", "2193-Q2")).toBe(-3);
  });

  it("moves each chart by the same number of quarters, so it keeps its span", () => {
    expect(moveChart(chart({ quarter: ["2193-Q2", "2193-Q3"] }), 1, quarters)).toEqual({
      spec: chart({ quarter: ["2193-Q3", "2193-Q4"] }),
      stays: null,
    });
    expect(moveChart(chart({ month: ["2193-11", "2193-12"] }), 1, quarters).spec).toEqual(
      chart({ month: ["2194-02", "2194-03"] }),
    );
    // A relative quarter becomes the dated one it is now, moved.
    expect(moveChart(chart({ quarter: ["latest"] }), -2, quarters).spec).toEqual(
      chart({ quarter: ["2193-Q3"] }),
    );
    const comparison: PinSpec = {
      title: "Q3 against Q4",
      kind: "comparison",
      comparison: { measure: "revenue", across: "quarter", from: "2193-Q3", to: "2193-Q4", by: [] },
    };
    expect(moveChart(comparison, 1, quarters).spec).toMatchObject({
      comparison: { from: "2193-Q4", to: "2194-Q1" },
    });
    const waterfall: PinSpec = {
      title: "What drove it",
      kind: "waterfall",
      waterfall: { by: "genre", then: "latest-1", now: "latest" },
    };
    expect(moveChart(waterfall, -1, quarters).spec).toMatchObject({
      waterfall: { then: "2193-Q3", now: "2193-Q4" },
    });
  });

  it("shows as saved, saying why, a chart over every quarter, past the ledgers, or undated", () => {
    expect(moveChart(chart({ genre: ["Memoir"] }), 1, quarters).stays).toBe("every");
    expect(moveChart(chart({ quarter: ["2193-Q1"] }), -1, quarters).stays).toBe("past");
    expect(moveChart(chart({ quarter: ["2194-Q1"] }), 1, quarters).stays).toBe("past");
    expect(moveChart(chart({}, "avg_rating"), 1, quarters).stays).toBe("ratings");
    expect(moveChart(chart({}, "checkouts"), 1, quarters).stays).toBe("checkouts");
    // As saved, a chart stays exactly as it is.
    const saved = chart({ quarter: ["latest"] });
    expect(moveChart(saved, 0, quarters)).toEqual({ spec: saved, stays: null });
  });
});
