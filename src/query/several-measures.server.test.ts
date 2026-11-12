import { describe, expect, it, vi } from "vitest";
import { loadBookshop } from "../bookshop/loader.server";
import type { DeepReadonly, SaleLine } from "../bookshop/types";
import { perMeasure, serializeResult } from "./result";
import { runQuery } from "./run-query.server";
import { rollUpSales } from "./sale-cells";
import { BASELINE_VIEW } from "./view.server";
import {
  QUERY_LIMITS,
  queryMeasures,
  type Measure,
  type Query,
  type QueryResult,
  type QueryView,
} from "./types";

// Several measures in one lookup (contract.md, "Several measures"; David, 12 Nov 2026): one table, each measure's
// figures exactly what it would be alone.

const quiet = () => {};
const run = (query: Query, view: QueryView = BASELINE_VIEW) => runQuery(query, view, quiet);
/** The lookup of one measure, as `query` asks it alone. */
const alone = (query: Query, measure: Measure): Query => {
  const { also: _also, sort, ...base } = query;
  const mine = sort && !queryMeasures(query).includes(sort.column as Measure);
  return { ...base, measure, ...(mine || sort?.column === measure ? { sort: sort! } : {}) };
};
const key = (query: Query, row: QueryResult["rows"][number]) =>
  JSON.stringify(query.by.map((d) => row[d] ?? null));

/** Each measure's column, total and evidence in `got` are exactly the measure's looked up alone. */
function expectEachAlone(query: Query, view: QueryView = BASELINE_VIEW) {
  const got = run(query, view);
  const label = JSON.stringify(query);
  expect(
    got.columns.map((c) => c.key),
    label,
  ).toEqual([...query.by, ...queryMeasures(query)]);
  for (const measure of queryMeasures(query)) {
    const one = run({ ...alone(query, measure), limit: QUERY_LIMITS.rows }, view);
    const byGroup = new Map(one.rows.map((row, i) => [key(query, row), i]));
    expect(got.measures![measure]!.total, `${label} ${measure}`).toBe(one.total);
    expect(got.measures![measure]!.evidence.total, `${label} ${measure}`).toEqual(
      one.evidence!.total,
    );
    expect(got.measures![measure]!.evidence.unit).toBe(one.evidence!.unit);
    got.rows.forEach((row, i) => {
      const at = byGroup.get(key(query, row))!;
      expect(row[measure], `${label} ${measure} ${key(query, row)}`).toBe(one.rows[at]![measure]);
      expect(got.measures![measure]!.evidence.rows[i]).toEqual(one.evidence!.rows[at]);
    });
  }
  // The first measure's figures stay where single-measure readers look.
  expect(got.total).toBe(got.measures![query.measure]!.total);
  expect(got.evidence).toEqual(got.measures![query.measure]!.evidence);
  return got;
}

describe("sales measures in one pass", () => {
  it("give each measure exactly its figures alone, over 2193's cells", () => {
    expectEachAlone({ measure: "revenue", also: ["units", "orders", "avg_order_value"], by: [] });
    expectEachAlone({ measure: "revenue", also: ["units"], by: ["quarter"] });
    expectEachAlone({
      measure: "orders",
      also: ["avg_discount", "orders_per_day", "revenue"],
      by: ["weekday", "quarter"],
    });
    expectEachAlone({
      measure: "orders_per_day",
      also: ["orders", "avg_order_value"],
      by: ["month"],
      filter: { genre: ["Mystery", "Fiction"] },
    });
    expectEachAlone({
      measure: "avg_discount",
      also: ["units", "revenue"],
      by: ["genre", "format"],
    });
  });

  it("count an order spanning groups once in each, for every measure that counts orders", () => {
    // Orders over several titles and formats, as lines and as cells (sale-cells.ts).
    const template = loadBookshop().saleLines;
    const isbns = [...new Set(template.map((s) => s.isbn))].slice(0, 3);
    const of = (isbn: string) => template.find((s) => s.isbn === isbn)!;
    const lines: DeepReadonly<SaleLine>[] = [];
    let id = 0;
    const order = (date: string, items: [number, number][]) => {
      const orderId = `sim-order:${lines.length}`;
      for (const [book, discount] of items)
        lines.push({ ...of(isbns[book]!), id: `sim:${id++}`, orderId, date, discount });
    };
    order("2194-01-05", [
      [0, 0],
      [0, 0],
      [1, 0],
    ]);
    order("2194-02-10", [
      [0, 0.15],
      [1, 0.15],
      [2, 0],
    ]);
    order("2194-03-01", [
      [2, 0.15],
      [2, 0.15],
    ]);
    const byLines: QueryView = {
      periods: ["2194-Q1"],
      includeUndated: false,
      simulatedSales: lines,
    };
    const byCells: QueryView = {
      periods: ["2194-Q1"],
      includeUndated: false,
      simulatedCells: rollUpSales(lines),
    };
    for (const view of [byLines, byCells])
      for (const by of [[], ["title"], ["month", "format"], ["discounted"]] as const) {
        const got = expectEachAlone(
          { measure: "units", also: ["revenue", "orders", "avg_order_value"], by: [...by] },
          view,
        );
        if (!by.length) expect(got.measures!.orders!.total).toBe(3);
      }
  });
});

describe("ratings and checkouts, lined up by group", () => {
  it("total each alone and line them up, a missing group a zero for a count and null for an average", () => {
    const query: Query = { measure: "avg_rating", also: ["checkouts", "ratings"], by: ["title"] };
    const got = run(query);
    const ratings = run({ measure: "avg_rating", by: ["title"] });
    const checkouts = run({ measure: "checkouts", by: ["title"] });
    const titles = (r: QueryResult) => new Set(r.rows.map((row) => row.title ?? null));
    const all = new Set([...titles(ratings), ...titles(checkouts)]);
    expect(got.rows).toHaveLength(Math.min(all.size, QUERY_LIMITS.rows));
    for (const row of got.rows) {
      const r = ratings.rows.find((x) => x.title === row.title);
      const c = checkouts.rows.find((x) => x.title === row.title);
      expect(row.avg_rating).toBe(r ? r.avg_rating : null);
      expect(row.checkouts).toBe(c ? c.checkouts : 0);
    }
    expect(got.measures!.checkouts!.total).toBe(checkouts.total);
    expect(got.measures!.avg_rating!.total).toBe(ratings.total);
    expect(got.source).toMatch(
      /^Average rating and ratings from [\d,]+ visible matching ratings: average rating, .*; ratings, .*; checkouts from [\d,]+ visible matching book\/month checkout rows: .*; undated source snapshot/,
    );
  });

  it("match each measure alone, by genre", () => {
    expectEachAlone({ measure: "checkouts", also: ["avg_rating"], by: ["genre"] });
    expectEachAlone({ measure: "ratings", also: ["avg_rating"], by: ["author"] });
  });

  it("still need the undated grant", () => {
    expect(() =>
      run(
        { measure: "avg_rating", also: ["checkouts"], by: [] },
        {
          periods: ["2193-Q1"],
          includeUndated: false,
        },
      ),
    ).toThrow(expect.objectContaining({ code: "UNAVAILABLE_FACTS" }));
  });
});

describe("sort and the row limit", () => {
  it("keep the top rows by the sort measure, the others filling in those rows", () => {
    const query: Query = {
      measure: "revenue",
      also: ["units"],
      by: ["title"],
      sort: { column: "units", direction: "desc" },
      limit: 5,
    };
    const got = expectEachAlone(query);
    const units = run({ measure: "units", by: ["title"], sort: query.sort, limit: 5 });
    expect(got.rows.map((r) => [r.title, r.units])).toEqual(
      units.rows.map((r) => [r.title, r.units]),
    );
    expect(got.truncated).toBe(true);
    // Totals are before the limit.
    expect(got.measures!.units!.total).toBe(56350);
  });

  it("sorts book records by any of theirs too", () => {
    const got = run({
      measure: "avg_rating",
      also: ["checkouts"],
      by: ["genre"],
      sort: { column: "checkouts", direction: "desc" },
    });
    const values = got.rows.map((r) => r.checkouts as number);
    expect(values).toEqual([...values].sort((a, b) => b - a));
  });
});

describe("a lookup of several measures, one measure at a time (perMeasure)", () => {
  it("is each measure's own lookup, its rows, total and evidence, with one truncated flag", () => {
    const query: Query = {
      measure: "revenue",
      also: ["units", "orders"],
      by: ["genre"],
      sort: { column: "units", direction: "desc" },
      limit: 3,
    };
    const got = run(query);
    const split = perMeasure(query, got);
    expect(split.map((s) => s.query.measure)).toEqual(["revenue", "units", "orders"]);
    for (const { query: one, result } of split) {
      expect(one).not.toHaveProperty("also");
      // Sorted by units: only units' own lookup keeps that sort.
      expect(one.sort).toEqual(one.measure === "units" ? query.sort : undefined);
      expect(result.columns.map((c) => c.key)).toEqual(["genre", one.measure]);
      expect(Object.keys(result.rows[0]!).sort()).toEqual(["genre", one.measure].sort());
      expect(result.total).toBe(got.measures![one.measure]!.total);
      expect(result.evidence).toEqual(got.measures![one.measure]!.evidence);
      expect(result).not.toHaveProperty("measures");
      expect(result.truncated).toBe(true);
    }
    const single: Query = { measure: "revenue", by: [] };
    const result = run(single);
    expect(perMeasure(single, result)).toEqual([{ query: single, result }]);
  });
});

describe("bounds, caches and telemetry", () => {
  it("fits four measures over 200 rows within the result cap", () => {
    const got = run({
      measure: "revenue",
      also: ["units", "avg_order_value", "avg_discount"],
      by: ["edition", "month"],
    });
    expect(got.rows).toHaveLength(QUERY_LIMITS.rows);
    const bytes = new TextEncoder().encode(serializeResult(got)).byteLength;
    // 60,235 bytes with 2193's editions by month (12 Nov 2026), against a single measure's 24,767: under half the cap.
    expect(bytes).toBeLessThan(QUERY_LIMITS.responseBytes);
    expect(bytes).toBeGreaterThan(QUERY_LIMITS.responseBytes / 4);
  });

  it("caches each list apart from the first measure alone", () => {
    const first = run({ measure: "revenue", by: ["quarter"] });
    const both = run({ measure: "revenue", also: ["units"], by: ["quarter"] });
    expect(first.columns.map((c) => c.key)).toEqual(["quarter", "revenue"]);
    expect(both.columns.map((c) => c.key)).toEqual(["quarter", "revenue", "units"]);
    expect(run({ measure: "revenue", by: ["quarter"] })).not.toHaveProperty("measures");
  });

  it("records how many measures and which, never a value", () => {
    const track = vi.fn();
    runQuery(
      { measure: "revenue", also: ["units"], by: [], filter: { title: ["SECRET_FILTER"] } },
      BASELINE_VIEW,
      track,
    );
    expect(track).toHaveBeenCalledWith(
      "query_completed",
      expect.objectContaining({ measure: "revenue", measureCount: 2, measures: "revenue,units" }),
    );
    expect(JSON.stringify(track.mock.calls)).not.toContain("SECRET");
    expect(() =>
      runQuery({ measure: "revenue", also: ["avg_rating"], by: [] }, BASELINE_VIEW, track),
    ).toThrow();
    expect(track).toHaveBeenLastCalledWith(
      "query_failed",
      expect.objectContaining({ code: "INCOMPATIBLE_MEASURES", measureCount: 0 }),
    );
  });
});
