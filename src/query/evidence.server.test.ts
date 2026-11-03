import { afterAll, describe, expect, it } from "vitest";
import { loadBookshop } from "../bookshop/loader.server";
import type { DeepReadonly, SaleLine } from "../bookshop/types";
import { simulateTurn } from "../simulation/turn";
import type { Plan } from "../simulation/types";
import { EVIDENCE_UNITS, lowEvidence, type Evidence } from "./evidence";
import { forgetResults, readHistoryAsLines, runQuery } from "./run-query.server";
import { mergeCells, rollUpSales } from "./sale-cells";
import type { Dimension, Measure, Query, QueryView } from "./types";

const quiet = () => {};
const run = (query: Query, view: QueryView) => runQuery(query, view, quiet);
const { lines } = simulateTurn(
  { quarter: "2194-Q1", seed: 3, plan: { levers: ["repick", "events"] } as Plan, event: null },
  loadBookshop(),
);
/** 2193, and a played 2194-Q1 as the save keeps it: cells. */
const view: QueryView = {
  periods: ["2193-Q1", "2193-Q2", "2193-Q3", "2193-Q4", "2194-Q1"],
  includeUndated: true,
  simulatedCells: rollUpSales(lines),
  version: "00000000000000e1",
};
const bys: Dimension[][] = [[], ["quarter"], ["genre"], ["month", "format"], ["title"]];
const filters: Query["filter"][] = [undefined, { quarter: ["2194-Q1"] }, { month: ["2193-07"] }];

/** Each average's n, from the plain query that counts what it's over. */
const counted: Record<keyof typeof EVIDENCE_UNITS, Measure> = {
  avg_order_value: "orders",
  avg_discount: "units",
  avg_rating: "ratings",
  orders_per_day: "orders",
};

describe("how much evidence is behind an average", () => {
  afterAll(() => readHistoryAsLines(false));

  for (const [measure, count] of Object.entries(counted) as [keyof typeof counted, Measure][])
    it(`gives ${measure} its ${EVIDENCE_UNITS[measure]}, row by row and in total`, () => {
      for (const by of measure === "avg_rating" ? [[], ["genre"], ["title"]] : bys)
        for (const filter of measure === "avg_rating" ? [undefined] : filters) {
          const query: Query = { measure, by: by as Dimension[], ...(filter && { filter }) };
          const result = run(query, view);
          const plain = run({ ...query, measure: count }, view);
          expect(result.evidence!.unit).toBe(EVIDENCE_UNITS[measure]);
          expect(result.evidence!.rows).toHaveLength(result.rows.length);
          result.rows.forEach((row, i) => {
            const n = result.evidence!.rows[i]!.n;
            const match = plain.rows.find((r) =>
              by.every((d) => r[d as Dimension] === row[d as Dimension]),
            )!;
            // Orders per day's n is its days: its orders over its figure.
            if (measure === "orders_per_day")
              expect(n).toBe(row[measure] ? Math.round(match.orders! / row[measure]!) : n);
            else expect(n).toBe(match[count]);
          });
          if (measure === "orders_per_day")
            expect(result.evidence!.total.n).toBe(Math.round(plain.total! / result.total!));
          else expect(result.evidence!.total.n).toBe(plain.total);
        }
    });

  it("counts the same from 2193's lines as from its cells", () => {
    const query: Query = { measure: "avg_order_value", by: ["month", "weekday"] };
    const cells = run(query, view);
    readHistoryAsLines(true);
    forgetResults();
    const asLines = run(query, view);
    readHistoryAsLines(false);
    forgetResults();
    expect(asLines.evidence!.rows.map((e) => e.n)).toEqual(cells.evidence!.rows.map((e) => e.n));
    asLines.evidence!.rows.forEach((e, i) =>
      expect(e.se).toBeCloseTo(cells.evidence!.rows[i]!.se!, 12),
    );
  });

  it("follows the rows through sorting and the row limit", () => {
    const query: Query = {
      measure: "avg_discount",
      by: ["title"],
      sort: { column: "avg_discount", direction: "desc" },
      limit: 5,
    };
    const result = run(query, view);
    const units = run({ measure: "units", by: ["title"] }, view);
    expect(result.evidence!.rows.map((e) => e.n)).toEqual(
      result.rows.map((row) => units.rows.find((r) => r.title === row.title)!.units),
    );
  });

  it("names a unit only for averages", () => {
    for (const measure of ["revenue", "units", "orders", "ratings", "checkouts"] as const)
      expect(run({ measure, by: ["genre"] }, view).evidence!.unit).toBeNull();
  });

  it("fades under 30 ratings, orders or sale lines, and never for days", () => {
    expect(lowEvidence("ratings", 29)).toBe(true);
    expect(lowEvidence("orders", 30)).toBe(false);
    expect(lowEvidence("sale lines", 1)).toBe(true);
    expect(lowEvidence("days", 1)).toBe(false);
  });
});

/** A standard error from scratch: the items' spread over the root of their count. */
function seOf(items: number[]): number | null {
  const n = items.length;
  if (n < 2) return null;
  const mean = items.reduce((t, x) => t + x, 0) / n;
  return Math.sqrt(items.reduce((t, x) => t + (x - mean) ** 2, 0) / (n - 1) / n);
}
/** Group 2193's lines by a key, and each group's orders' totals. */
function byGroup(key: (line: DeepReadonly<SaleLine>) => string) {
  const groups = new Map<
    string,
    { lines: DeepReadonly<SaleLine>[]; totals: Map<string, number> }
  >();
  for (const line of loadBookshop().saleLines) {
    const k = key(line);
    let g = groups.get(k);
    if (!g) groups.set(k, (g = { lines: [], totals: new Map() }));
    g.lines.push(line);
    g.totals.set(
      line.orderId,
      (g.totals.get(line.orderId) ?? 0) + line.listPrice * (1 - line.discount),
    );
  }
  return groups;
}
// Within a billionth, or 1e-6 absolute: a group whose items are all equal has no spread, but the sum of squares
// less n times the mean squared leaves about 1e-12 of rounding, and the root makes that about 1e-7 (a ten-millionth
// of a dollar, far below anything a 95% test can tell).
const close = (got: number | null, want: number | null, label = "") =>
  want === null
    ? expect(got, label).toBeNull()
    : expect(Math.abs(got! - want), label).toBeLessThanOrEqual(1e-9 * want + 1e-6);

describe("the spread behind a figure", () => {
  const y2193: QueryView = {
    periods: ["2193-Q1", "2193-Q2", "2193-Q3", "2193-Q4"],
    includeUndated: true,
  };

  it("matches order totals, discounts and ratings worked out from scratch", () => {
    const groups = byGroup((line) => `${line.date.slice(0, 7)}|${line.format}`);
    for (const measure of ["revenue", "avg_order_value", "avg_discount"] as const) {
      const result = run({ measure, by: ["month", "format"] }, y2193);
      expect(result.rows).toHaveLength(groups.size);
      result.rows.forEach((row, i) => {
        const g = groups.get(`${row.month}|${row.format}`)!;
        const totals = [...g.totals.values()];
        const want =
          measure === "revenue"
            ? Math.sqrt(totals.reduce((t, x) => t + x * x, 0))
            : measure === "avg_order_value"
              ? seOf(totals)
              : seOf(g.lines.map((line) => line.discount));
        close(result.evidence!.rows[i]!.se, want, `${measure} ${JSON.stringify(row)}`);
      });
    }
    const ratings = new Map<string, number[]>();
    for (const r of loadBookshop().joinedRatings) {
      const title = r.book?.title ?? "";
      ratings.set(title, [...(ratings.get(title) ?? []), r.rating]);
    }
    const result = run({ measure: "avg_rating", by: ["title"], limit: 200 }, y2193);
    result.rows.forEach((row, i) =>
      close(result.evidence!.rows[i]!.se, seOf(ratings.get(row.title ?? "")!), JSON.stringify(row)),
    );
  });

  it("gives counts their Poisson spread, and orders per day its orders'", () => {
    for (const measure of ["units", "orders", "ratings", "checkouts"] as const) {
      const result = run({ measure, by: ["genre"] }, y2193);
      result.rows.forEach((row, i) =>
        expect(result.evidence!.rows[i]!.se).toBeCloseTo(Math.sqrt(row[measure]!), 12),
      );
    }
    const perDay = run({ measure: "orders_per_day", by: ["weekday"] }, y2193);
    const orders = run({ measure: "orders", by: ["weekday"] }, y2193);
    perDay.rows.forEach((row, i) => {
      const e = perDay.evidence!.rows[i]!;
      expect(e.se).toBeCloseTo(Math.sqrt(orders.rows[i]!.orders!) / e.n, 12);
    });
  });

  // The save's cells against the same lines one by one: orders spanning cells (the new volume joining baskets)
  // must give the same totals' squares, through the cross terms.
  it("gives a played quarter's cells the spread of its lines", () => {
    const asLines: QueryView = { ...view, simulatedCells: undefined, simulatedSales: lines };
    delete asLines.simulatedCells;
    delete asLines.version;
    const spanning = view.simulatedCells!.spanning.length;
    expect(spanning).toBeGreaterThan(100);
    for (const measure of ["revenue", "avg_order_value"] as const)
      for (const by of [
        [],
        ["genre"],
        ["title"],
        ["month", "weekday"],
        ["format"],
        ["edition"],
      ] as Dimension[][]) {
        const query: Query = { measure, by, filter: { quarter: ["2194-Q1"] } };
        const cells = run(query, view).evidence!;
        const one = run(query, asLines).evidence!;
        const all = [...cells.rows, cells.total];
        [...one.rows, one.total].forEach((e: Evidence, i) => {
          expect(e.n).toBe(all[i]!.n);
          close(all[i]!.se, e.se, `${measure} ${JSON.stringify(by)} ${i}`);
        });
      }
  });

  it("keeps each spanning order's lines with it when quarters' cells are merged", () => {
    // An order sits on one date, so a quarter's months roll up apart and merge into the same orders.
    const months = ["2194-01", "2194-02", "2194-03"].map((m) =>
      rollUpSales(lines.filter((line) => line.date.startsWith(m))),
    );
    const merged: QueryView = {
      ...view,
      simulatedCells: mergeCells(months),
      version: "00000000000000e2",
    };
    for (const by of [["genre"], ["title"], []] as Dimension[][]) {
      const query: Query = { measure: "revenue", by, filter: { quarter: ["2194-Q1"] } };
      const whole = run(query, view).evidence!;
      const parts = run(query, merged).evidence!;
      [...parts.rows, parts.total].forEach((e, i) =>
        close(e.se, [...whole.rows, whole.total][i]!.se, `${JSON.stringify(by)} ${i}`),
      );
    }
  });

  it("gives last year's figures last year's evidence", () => {
    const query: Query = {
      measure: "avg_order_value",
      by: ["genre"],
      filter: { quarter: ["2194-Q1"] },
      vs: "last_year",
    };
    const result = run(query, view);
    const before = run(
      { measure: "avg_order_value", by: ["genre"], filter: { quarter: ["2193-Q1"] } },
      view,
    );
    result.rows.forEach((row, i) => {
      const at = before.rows.findIndex((r) => r.genre === row.genre);
      expect(result.lastYear!.evidence.rows[i]).toEqual(
        at < 0 ? { n: 0, se: null } : before.evidence!.rows[at],
      );
    });
    expect(result.lastYear!.evidence.total).toEqual(before.evidence!.total);
    const hidden = run({ measure: "avg_order_value", by: ["format"], vs: "last_year" }, view);
    expect(hidden.lastYear!.evidence.rows.every((e) => e === null)).toBe(true);
  });
});
