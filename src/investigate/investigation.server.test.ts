import { describe, expect, it } from "vitest";
import { runQuery as engineQuery } from "~/query/run-query.server";
import type { Query, QueryView } from "~/query/types";
import { change } from "./format";
import { buildTile, investigate } from "./investigation.server";
import { DEFAULT_STATE } from "./state";
import { waterfall } from "~/query/decompose";

// Frank's engine, without its telemetry.
const runQuery = (query: Query, v: QueryView) => engineQuery(query, v, () => {});

const view: QueryView = {
  periods: ["2193-Q1", "2193-Q2", "2193-Q3", "2193-Q4"],
  includeUndated: true,
};
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
    const drilled = investigate(
      { ...DEFAULT_STATE, by: "genre", filters: { genre: ["Fiction"] } },
      runQuery,
      view,
    );
    expect(drilled.chart.rows.length).toBe(result.options.genre.length);
    expect(drilled.tiles[0]!.value!).toBeLessThan(result.tiles[0]!.value!);
    const heatTotal = (r: typeof result) =>
      r.heatmap.rows.reduce((sum, row) => sum + (row.revenue ?? 0), 0);
    expect(heatTotal(drilled)).toBeLessThan(heatTotal(result));
  });
});

describe("the queries it sends", () => {
  it("never sends filter: undefined, and lists quarters from the view, sales or not", () => {
    const sent: unknown[] = [];
    const recording: typeof runQuery = (query, v) => {
      sent.push(query);
      return runQuery(query, v);
    };
    const future: QueryView = { ...view, periods: [...view.periods, "2194-Q1"] };
    const result = investigate(DEFAULT_STATE, recording, future);
    expect(
      sent.every(
        (q) =>
          !Object.hasOwn(q as object, "filter") || (q as { filter: unknown }).filter !== undefined,
      ),
    ).toBe(true);
    expect(result.options.quarter).toEqual([...quarters, "2194-Q1"]);
  });
});

describe("awards", () => {
  it("lists every award a book has won, and filters and breaks down by them", () => {
    const result = investigate(DEFAULT_STATE, runQuery, view);
    expect(result.options.award).toHaveLength(12);
    expect(result.options.award).toContain("Hugo Award");
    expect([...result.options.award]).toEqual([...result.options.award].sort());
    const hugo = investigate(
      { ...DEFAULT_STATE, filters: { award: ["Hugo Award"] } },
      runQuery,
      view,
    );
    expect(hugo.tiles[0]!.value!).toBeGreaterThan(0);
    expect(hugo.tiles[0]!.value!).toBeLessThan(result.tiles[0]!.value!);
    const split = investigate({ ...DEFAULT_STATE, by: "awarded" }, runQuery, view);
    expect(split.chart.rows.map((row) => row.awarded).sort()).toEqual(["no", "yes"]);
  });
});

describe("series", () => {
  it("lists the volumes in order, and filters and breaks down by them", () => {
    const result = investigate(DEFAULT_STATE, runQuery, view);
    expect(result.options.volume).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
    const saga = investigate({ ...DEFAULT_STATE, measure: "units", by: "volume" }, runQuery, view);
    expect(saga.chart.rows.some((row) => row.volume === null)).toBe(true);
    // The Mallemaroking Saga's volumes, as #169 measured them: 7,334, 4,636 and 4,077 copies.
    const mallemaroking = runQuery(
      { measure: "units", by: ["volume"], filter: { series: ["The Mallemaroking Saga"] } },
      view,
    );
    expect(mallemaroking.rows.map((row) => [row.volume, row.units])).toEqual([
      ["1", 7334],
      ["2", 4636],
      ["3", 4077],
    ]);
    const standalone = investigate(
      { ...DEFAULT_STATE, filters: { in_series: ["no"] } },
      runQuery,
      view,
    );
    expect(standalone.tiles[0]!.value!).toBeLessThan(result.tiles[0]!.value!);
  });
});

describe("several measures", () => {
  it("runs one chart query per measure, in the order chosen, and the tiles keep the first", () => {
    const result = investigate({ ...DEFAULT_STATE, also: ["units", "orders"] }, runQuery, view);
    expect(result.also.map((r) => r.columns.at(-1)!.key)).toEqual(["units", "orders"]);
    expect(result.also[0]!.rows).toHaveLength(12);
    expect(investigate(DEFAULT_STATE, runQuery, view).also).toEqual([]);
  });
});

describe("the title view", () => {
  it("appears for exactly one title, by month, ignoring its own month filter", () => {
    expect(investigate(DEFAULT_STATE, runQuery, view).titleView).toBeNull();
    const title = "Hashtag QuokkaSelfie";
    const drilled = investigate(
      { ...DEFAULT_STATE, filters: { title: [title], month: ["2193-12"] } },
      runQuery,
      view,
    );
    expect(drilled.titleView?.title).toBe(title);
    expect(drilled.titleView?.result.rows.length).toBe(12);
    const twoTitles = investigate(
      { ...DEFAULT_STATE, filters: { title: [title, "The Thing Is"] } },
      runQuery,
      view,
    );
    expect(twoTitles.titleView).toBeNull();
  });

  it("counts the title's ratings by stars, whatever else the screen filters, and records them as no evidence", () => {
    const observed: unknown[] = [];
    const title = "Land Water Sky Space";
    const state = {
      ...DEFAULT_STATE,
      filters: { title: [title], quarter: ["2193-Q4"], format: ["Hardcover"] },
    };
    const drilled = investigate(state, runQuery, view, (query) => observed.push(query));
    const ratings = drilled.titleView!.ratings;
    expect(ratings.rows.reduce((sum, row) => sum + Number(row.ratings), 0)).toBe(95);
    expect(ratings.rows.every((row) => ["1", "2", "3", "4", "5"].includes(String(row.stars)))).toBe(
      true,
    );
    expect(observed.some((q) => (q as { measure: string }).measure === "ratings")).toBe(false);
    // A title nobody rated has none.
    expect(
      investigate({ ...DEFAULT_STATE, filters: { title: ["Cimornul"] } }, runQuery, view).titleView!
        .ratings.rows,
    ).toEqual([]);
  });
});

describe("buildTile", () => {
  const byQuarter = {
    columns: [],
    total: 0,
    source: "",
    rows: [
      { quarter: "2193-Q1", units: 5 },
      { quarter: "2193-Q3", units: 9 },
    ],
  };

  it("follows the latest selected quarter", () => {
    expect(
      buildTile("units", byQuarter, quarters, { quarter: ["2193-Q3", "2193-Q1"] }),
    ).toMatchObject({ quarter: "2193-Q3", previousQuarter: "2193-Q2", value: 9, previous: 0 });
  });

  it("reports the quarter a month filter allows, and won't compare across it", () => {
    expect(
      buildTile("units", byQuarter, quarters, {
        quarter: ["2193-Q3", "2193-Q4"],
        month: ["2193-09"],
      }),
    ).toMatchObject({
      quarter: "2193-Q3",
      previousQuarter: null,
      value: 9,
    });
    expect(
      buildTile("units", byQuarter, quarters, { month: ["2193-03", "2193-06"] }),
    ).toMatchObject({ quarter: "2193-Q2", previousQuarter: "2193-Q1", value: 0 });
  });

  it("has nothing to compare the first quarter with", () => {
    expect(buildTile("units", byQuarter, quarters, { quarter: ["2193-Q1"] })).toMatchObject({
      value: 5,
      previous: null,
      previousQuarter: null,
    });
  });
});

describe("change", () => {
  it("reads averages in points and totals in percent, colored by whether up is good", () => {
    expect(change("avg_discount", 0.12, 0.1)).toEqual({
      text: "+2.0 pts",
      direction: "up",
      good: null,
    });
    expect(change("orders", 90, 100)).toEqual({ text: "-10.0%", direction: "down", good: false });
    expect(change("units", 5, 0)).toBeNull();
  });
});

it("observes only panels whose queries actually differ from their own default", () => {
  const observed: Query[] = [];
  const observe = (query: Query) => observed.push(query);
  investigate(DEFAULT_STATE, runQuery, view, observe);
  expect(observed).toEqual([]);
  investigate({ ...DEFAULT_STATE, by: "format" }, runQuery, view, observe);
  expect(observed.map((q) => q.by)).toEqual([["format"]]);
  observed.length = 0;
  investigate({ ...DEFAULT_STATE, measure: "orders_per_day" }, runQuery, view, observe);
  expect(observed.map((q) => q.by)).toEqual([["month"]]);
  observed.length = 0;
  investigate(
    { ...DEFAULT_STATE, filters: { title: ["Hashtag QuokkaSelfie"], discount_rate: ["15%"] } },
    runQuery,
    view,
    observe,
  );
  expect(observed.map((q) => q.by)).toEqual([["month"], ["month"]]);
});

describe("vs. same quarter last year", () => {
  const sent = (state: Partial<typeof DEFAULT_STATE>) => {
    const queries: Query[] = [];
    investigate(
      { ...DEFAULT_STATE, ...state },
      (query, v) => (queries.push(query), runQuery(query, v)),
      { ...view, periods: [...quarters, "2194-Q1"] },
    );
    return queries;
  };

  it("asks the chart's query for last year only where the chart can show it", () => {
    const on = sent({ by: "genre", lastYear: true, filters: { quarter: ["2194-Q1"] } });
    expect(on.filter((q) => q.vs)).toEqual([
      { measure: "revenue", by: ["genre"], filter: { quarter: ["2194-Q1"] }, vs: "last_year" },
    ]);
    expect(
      sent({ by: "genre", lastYear: true, filters: { quarter: ["2193-Q4"] } }).some((q) => q.vs),
    ).toBe(false);
    expect(sent({ by: "genre", lastYear: true }).some((q) => q.vs)).toBe(false);
    expect(sent({ by: "genre", filters: { quarter: ["2194-Q1"] } }).some((q) => q.vs)).toBe(false);
  });
});

describe("what drove the change (David, 3 Nov 2026)", () => {
  const drove = {
    ...DEFAULT_STATE,
    by: "genre" as const,
    drove: true,
    filters: { quarter: ["2193-Q3"] },
  };

  it("sends each quarter's revenue by the breakdown, and units with the split", () => {
    const queries: Query[] = [];
    const spy = (query: Query, v: QueryView) => {
      queries.push(query);
      return runQuery(query, v);
    };
    const plain = investigate(drove, spy, view).drove!;
    expect([plain.then, plain.now]).toEqual(["2193-Q2", "2193-Q3"]);
    expect(plain.thenRows.units).toBeUndefined();
    expect(plain.nowRows.revenue.total).toBeCloseTo(274036.165, 3);
    const split = investigate({ ...drove, split: true }, spy, view).drove!;
    expect(split.thenRows.units!.total).toBeGreaterThan(0);
    // Plain queries with the quarter, never vs: a genre gone this quarter is still in last quarter's rows.
    // Its queries (the chart's own sends no limit): 2 without the split, 4 with, plain, never vs.
    const sent = queries.filter((q) => q.limit === 200);
    expect(sent).toHaveLength(6);
    expect(sent.every((q) => q.vs === undefined && q.filter?.quarter?.length === 1)).toBe(true);
  });

  it("counts only the groups drawn as their own bars as evidence, never the rest or units (Plot, #335)", () => {
    const observed: { query: Query; rows: number; keys: (string | null)[] }[] = [];
    const titles = { ...drove, by: "title" as const, split: true };
    const result = investigate(titles, runQuery, view, (query, r) =>
      observed.push({ query, rows: r.rows.length, keys: r.rows.map((row) => row.title ?? null) }),
    ).drove!;
    const ours = observed.filter((o) => o.query.limit === 200);
    // Each quarter's revenue, narrowed to the drawn titles; units are never recorded.
    expect(ours.map((o) => [o.query.measure, o.query.filter?.quarter?.[0]])).toEqual([
      ["revenue", "2193-Q2"],
      ["revenue", "2193-Q3"],
    ]);
    const drawn = waterfall("title", result.thenRows, result.nowRows).groups.map((g) => g.key);
    expect(drawn).toHaveLength(8);
    expect(result.nowRows.revenue.rows.length).toBeGreaterThan(8);
    for (const o of ours) expect(o.keys.every((k) => drawn.includes(k))).toBe(true);
  });

  it("sends nothing when it's off or can't be shown", () => {
    expect(investigate({ ...drove, drove: false }, runQuery, view).drove).toBeNull();
    // Q1 2193 has no quarter before it.
    expect(
      investigate({ ...drove, filters: { quarter: ["2193-Q1"] } }, runQuery, view).drove,
    ).toBeNull();
    expect(investigate({ ...drove, measure: "units" }, runQuery, view).drove).toBeNull();
  });
});
