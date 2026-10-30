import { describe, expect, it } from "vitest";
import type { QueryView } from "~/query/types";
import { change } from "./format";
import { buildTile, investigate } from "./investigation.server";
import { runQuery } from "./query-stub.server";
import { DEFAULT_STATE } from "./state";

const view: QueryView = { periods: ["2193-Q1", "2193-Q2", "2193-Q3", "2193-Q4"], includeUndated: true };
const quarters = view.periods;

describe("investigate", () => {
  const result = investigate(DEFAULT_STATE, runQuery, view);

  it("reports the latest quarter against the one before", () => {
    const revenue = result.tiles.find((t) => t.measure === "revenue")!;
    expect(revenue.quarter).toBe("2193-Q4");
    expect(revenue.previousQuarter).toBe("2193-Q3");
    expect(revenue.value).toBeCloseTo(161524.6946, 3);
    expect(revenue.previous).toBeCloseTo(274036.165, 3);
    expect(change("revenue", revenue.value, revenue.previous)?.text).toBe("-41.1%");
  });

  it("charts every month and fills the weekday by month heatmap", () => {
    expect(result.chart.rows).toHaveLength(12);
    expect(result.heatmap.rows).toHaveLength(84);
    expect(result.options.quarter).toEqual(quarters);
  });

  it("keeps the drilled-into dimension's bars but filters everything else", () => {
    const drilled = investigate({ ...DEFAULT_STATE, by: "genre", filters: { genre: ["Fiction"] } }, runQuery, view);
    expect(drilled.chart.rows.length).toBe(result.options.genre.length);
    expect(drilled.tiles[0]!.value!).toBeLessThan(result.tiles[0]!.value!);
    const heatTotal = (r: typeof result) => r.heatmap.rows.reduce((sum, row) => sum + (row.revenue ?? 0), 0);
    expect(heatTotal(drilled)).toBeLessThan(heatTotal(result));
  });
});

describe("the title view", () => {
  it("appears for exactly one title, by month, ignoring its own month filter", () => {
    expect(investigate(DEFAULT_STATE, runQuery, view).titleView).toBeNull();
    const title = "Hashtag QuokkaSelfie";
    const drilled = investigate({ ...DEFAULT_STATE, filters: { title: [title], month: ["12"] } }, runQuery, view);
    expect(drilled.titleView?.title).toBe(title);
    expect(drilled.titleView?.result.rows.length).toBe(12);
    const twoTitles = investigate({ ...DEFAULT_STATE, filters: { title: [title, "The Thing Is"] } }, runQuery, view);
    expect(twoTitles.titleView).toBeNull();
  });
});

describe("buildTile", () => {
  const byQuarter = { columns: [], total: 0, source: "", rows: [{ quarter: "2193-Q1", units: 5 }, { quarter: "2193-Q3", units: 9 }] };

  it("follows the latest selected quarter", () => {
    expect(buildTile("units", byQuarter, quarters, { quarter: ["2193-Q3", "2193-Q1"] })).toMatchObject({ quarter: "2193-Q3", previousQuarter: "2193-Q2", value: 9, previous: 0 });
  });

  it("reports the quarter a month filter allows, and won't compare across it", () => {
    expect(buildTile("units", byQuarter, quarters, { quarter: ["2193-Q3", "2193-Q4"], month: ["09"] })).toMatchObject({
      quarter: "2193-Q3",
      previousQuarter: null,
      value: 9,
    });
    expect(buildTile("units", byQuarter, quarters, { month: ["03", "06"] })).toMatchObject({ quarter: "2193-Q2", previousQuarter: "2193-Q1", value: 0 });
  });

  it("has nothing to compare the first quarter with", () => {
    expect(buildTile("units", byQuarter, quarters, { quarter: ["2193-Q1"] })).toMatchObject({ value: 5, previous: null, previousQuarter: null });
  });
});

describe("change", () => {
  it("reads averages in points and totals in percent, colored by whether up is good", () => {
    expect(change("avg_discount", 0.12, 0.1)).toEqual({ text: "+2.0 pts", direction: "up", good: null });
    expect(change("orders", 90, 100)).toEqual({ text: "-10.0%", direction: "down", good: false });
    expect(change("units", 5, 0)).toBeNull();
  });
});
