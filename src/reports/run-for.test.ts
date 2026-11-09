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

  it("moves months across a year's end, and a comparison across months (Frank, #410)", () => {
    expect(moveChart(chart({ month: ["2194-01", "2194-02"] }), -1, quarters).spec).toEqual(
      chart({ month: ["2193-10", "2193-11"] }),
    );
    expect(moveChart(chart({ month: ["2193-11"] }), 1, quarters).spec).toEqual(
      chart({ month: ["2194-02"] }),
    );
    const months: PinSpec = {
      title: "October against November",
      kind: "comparison",
      comparison: { measure: "revenue", across: "month", from: "2193-10", to: "2193-11", by: [] },
    };
    expect(moveChart(months, -1, quarters).spec).toMatchObject({
      comparison: { from: "2193-07", to: "2193-08" },
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

describe("where Run for…'s list opens (measured in Decide's side panel)", () => {
  it("opens leftward where it fits, rightward where only that fits, else narrowed to the roomier side", async () => {
    const { placeList } = await import("./RunFor");
    // 1440 px: the button at the side panel's right (panel 960 to 1440).
    expect(placeList(1202, 1269, 960, 1440)).toEqual({ align: "end", width: 280 });
    // 390 px: the header wrapped, the button at the left edge.
    expect(placeList(24, 92, 0, 390)).toEqual({ align: "start", width: 280 });
    // Neither side holds 280 px: the roomier side, narrowed.
    expect(placeList(100, 160, 0, 300)).toEqual({ align: "start", width: 192 });
    expect(placeList(200, 260, 0, 300)).toEqual({ align: "end", width: 252 });
  });
});

describe("a moved chart's Now: line (Plot and Chart, #412)", () => {
  it("names what it shows now: a waterfall's quarters, a comparison's sides, else months or quarters", async () => {
    const { nowShows } = await import("./RunFor");
    expect(
      nowShows({
        title: "What drove it",
        kind: "waterfall",
        waterfall: { by: "genre", then: "2193-Q4", now: "2194-Q1" },
      }),
    ).toBe("Q4 2193 to Q1 2194");
    expect(
      nowShows({
        title: "July against August",
        kind: "comparison",
        comparison: { measure: "revenue", across: "month", from: "2193-07", to: "2193-08", by: [] },
      }),
    ).toBe("2193 Jul against 2193 Aug");
    expect(nowShows(chart({ quarter: ["2194-Q1"] }))).toBe("Q1 2194");
    expect(nowShows(chart({ month: ["2194-02", "2194-01", "2194-03"] }))).toBe(
      "2194 Jan, 2194 Feb and 2194 Mar",
    );
    // Months are the narrower filter.
    expect(nowShows(chart({ quarter: ["2194-Q1"], month: ["2194-01"] }))).toBe("2194 Jan");
    expect(nowShows(chart({}))).toBeNull();
  });
});
