import { afterAll, describe, expect, it } from "vitest";
import { loadBookshop } from "../bookshop/loader.server";
import { simulateTurn } from "../simulation/turn";
import type { Plan } from "../simulation/types";
import { EVIDENCE_UNITS, lowEvidence } from "./evidence";
import { forgetResults, readHistoryAsLines, runQuery } from "./run-query.server";
import { rollUpSales } from "./sale-cells";
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
    expect(asLines.evidence).toEqual(cells.evidence);
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
    expect(result.evidence!.rows).toEqual(
      result.rows.map((row) => ({ n: units.rows.find((r) => r.title === row.title)!.units })),
    );
  });

  it("is only for averages", () => {
    for (const measure of ["revenue", "units", "orders", "ratings", "checkouts"] as const)
      expect(run({ measure, by: ["genre"] }, view).evidence).toBeUndefined();
  });

  it("fades under 30 ratings, orders or sale lines, and never for days", () => {
    expect(lowEvidence("ratings", 29)).toBe(true);
    expect(lowEvidence("orders", 30)).toBe(false);
    expect(lowEvidence("sale lines", 1)).toBe(true);
    expect(lowEvidence("days", 1)).toBe(false);
  });
});
