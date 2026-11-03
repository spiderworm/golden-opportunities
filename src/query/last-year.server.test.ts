import { describe, expect, it } from "vitest";
import { loadBookshop } from "../bookshop/loader.server";
import type { DeepReadonly, SaleLine } from "../bookshop/types";
import { QueryError } from "./errors";
import { change, lastYearQuery, yearEarlier } from "./last-year";
import { runQuery } from "./run-query.server";
import { investigateOnly, type Query, type QueryView } from "./types";

const quiet = () => {};
const run = (query: Query, view: QueryView) => runQuery(query, view, quiet);
const lines = loadBookshop().saleLines;
/** Every fiftieth of 2193-Q1's lines, sold again a year later: 2194-Q1. */
const sold: DeepReadonly<SaleLine>[] = lines
  .filter((line) => line.date < "2193-04")
  .filter((_, i) => i % 50 === 0)
  .map((line, i) => ({
    ...line,
    id: `sim:${i}`,
    orderId: `sim-order:${i}`,
    date: `2194${line.date.slice(4)}`,
  }));
const view: QueryView = {
  periods: ["2193-Q1", "2193-Q2", "2193-Q3", "2193-Q4", "2194-Q1"],
  includeUndated: false,
  simulatedSales: sold,
};

describe("a query against the same quarter last year", () => {
  it("gives each quarter the quarter a year earlier, and nothing before 2193", () => {
    const result = run({ measure: "revenue", by: ["quarter"], vs: "last_year" }, view);
    const plain = run({ measure: "revenue", by: ["quarter"] }, view);
    expect(result.rows).toEqual(plain.rows);
    expect(result.lastYear!.rows).toEqual([
      null,
      null,
      null,
      null,
      { value: plain.rows[0]!.revenue },
    ]);
    // Every quarter together: four of them have no year before.
    expect(result.lastYear!.total).toBeNull();
  });

  it("gives a breakdown of one quarter the same breakdown a year earlier", () => {
    const query: Query = {
      measure: "units",
      by: ["genre"],
      filter: { quarter: ["2194-Q1"] },
      vs: "last_year",
    };
    const result = run(query, view);
    const before = run({ measure: "units", by: ["genre"], filter: { quarter: ["2193-Q1"] } }, view);
    expect(result.rows.length).toBeGreaterThan(1);
    result.rows.forEach((row, i) => {
      const was = before.rows.find((r) => r.genre === row.genre);
      expect(result.lastYear!.rows[i]).toEqual({ value: was?.units ?? 0 });
    });
    expect(result.lastYear!.total).toEqual({ value: before.total });
  });

  it("matches each month to the same month a year earlier", () => {
    const result = run(
      { measure: "orders", by: ["month"], filter: { quarter: ["2194-Q1"] }, vs: "last_year" },
      view,
    );
    const before = run(
      { measure: "orders", by: ["month"], filter: { quarter: ["2193-Q1"] } },
      view,
    );
    expect(result.rows.map((r) => r.month)).toEqual(["2194-01", "2194-02", "2194-03"]);
    expect(result.lastYear!.rows).toEqual(before.rows.map((r) => ({ value: r.orders })));
  });

  it("has no last year for a breakdown over every quarter, or one the player can't see", () => {
    const all = run({ measure: "revenue", by: ["format"], vs: "last_year" }, view);
    expect(all.lastYear!.rows.every((figure) => figure === null)).toBe(true);
    const hidden = run(
      { measure: "revenue", by: ["format"], filter: { quarter: ["2194-Q1"] }, vs: "last_year" },
      { ...view, periods: ["2194-Q1"] },
    );
    expect(hidden.lastYear).toEqual({
      rows: hidden.rows.map(() => null),
      total: null,
      evidence: { rows: hidden.rows.map(() => null), total: null },
    });
  });

  it("counts a group that didn't sell last year as zero, and its average as no value", () => {
    const priced = {
      ...view,
      simulatedSales: [...sold, { ...sold[0]!, id: "sim:new", listPrice: 999.99 }],
    };
    const filter = { quarter: ["2194-Q1"], list_price: ["$999.99"] };
    const units = run({ measure: "units", by: ["list_price"], filter, vs: "last_year" }, priced);
    expect(units.rows).toEqual([{ list_price: "$999.99", units: 1 }]);
    expect(units.lastYear).toEqual({
      rows: [{ value: 0 }],
      total: { value: 0 },
      evidence: { rows: [{ n: 0, se: 0 }], total: { n: 0, se: 0 } },
    });
    const discount = run(
      { measure: "avg_discount", by: ["list_price"], filter, vs: "last_year" },
      priced,
    );
    expect(discount.lastYear).toEqual({
      rows: [{ value: null }],
      total: { value: null },
      evidence: { rows: [{ n: 0, se: null }], total: { n: 0, se: null } },
    });
  });

  it("finds last year's group even past the row limit", () => {
    const result = run(
      {
        measure: "units",
        by: ["title", "weekday"],
        filter: { quarter: ["2194-Q1"] },
        sort: { column: "title", direction: "desc" },
        limit: 3,
        vs: "last_year",
      },
      view,
    );
    // 2193-Q1 has 367 title-weekday groups; these are past the first 200 (Sim, #292).
    result.rows.forEach((row, i) => {
      const before = run(
        {
          measure: "units",
          by: [],
          filter: { quarter: ["2193-Q1"], title: [row.title!], weekday: [row.weekday!] },
        },
        view,
      );
      expect(result.lastYear!.rows[i]).toEqual({ value: before.total });
    });
  });

  it("refuses undated measures and unknown comparisons, and isn't Dewey's yet", () => {
    const refused = (query: unknown) => {
      try {
        runQuery(query, { ...view, includeUndated: true }, quiet);
      } catch (error) {
        return (error as QueryError).code;
      }
      return null;
    };
    expect(refused({ measure: "avg_rating", by: [], vs: "last_year" })).toBe(
      "INCOMPATIBLE_DIMENSION",
    );
    expect(refused({ measure: "revenue", by: [], vs: "last_quarter" })).toBe("INVALID_QUERY");
    expect(investigateOnly({ measure: "revenue", by: [], vs: "last_year" })).toBe("vs");
  });
});

describe("last year's arithmetic", () => {
  it("moves quarters and months back a year and leaves other values", () => {
    expect(yearEarlier("quarter", "2194-Q3")).toBe("2193-Q3");
    expect(yearEarlier("month", "2200-11")).toBe("2199-11");
    expect(yearEarlier("genre", "2194-Q3")).toBe("2194-Q3");
    expect(
      lastYearQuery({
        measure: "revenue",
        by: ["genre"],
        filter: { quarter: ["2195-Q2"], month: ["2195-05"], format: ["Paperback"] },
        sort: { column: "revenue", direction: "desc" },
        limit: 5,
        vs: "last_year",
      }),
    ).toEqual({
      measure: "revenue",
      by: ["genre"],
      filter: { quarter: ["2194-Q2"], month: ["2194-05"], format: ["Paperback"] },
    });
  });

  it("calls a rise from zero new, never Infinity, and has no change without both figures", () => {
    expect(change(150, { value: 100 })).toEqual({ delta: 50, percent: 0.5 });
    expect(change(50, { value: 100 })).toEqual({ delta: -50, percent: -0.5 });
    expect(change(20, { value: 0 })).toEqual({ delta: 20, percent: "new" });
    expect(change(0, { value: 0 })).toEqual({ delta: 0, percent: 0 });
    expect(change(20, null)).toEqual({ delta: null, percent: null });
    expect(change(0.1, { value: null })).toEqual({ delta: null, percent: null });
    expect(change(null, { value: 3 })).toEqual({ delta: null, percent: null });
  });
});
