import { describe, expect, it } from "vitest";
import { loadBookshop } from "../bookshop/loader.server";
import { simulateTurn } from "../simulation/turn";
import type { Plan } from "../simulation/types";
import { QueryError } from "./errors";
import { runQuery } from "./run-query.server";
import { rollUpSales } from "./sale-cells";
import type { Query, QueryView } from "./types";

const quiet = () => {};
const run = (query: Query, view: QueryView) => runQuery(query, view, quiet);
const { lines } = simulateTurn(
  { quarter: "2194-Q1", seed: 3, plan: { levers: ["repick", "events"] } as Plan, event: null },
  loadBookshop(),
);
/** Q1 2194 played: the latest quarter with sales is Q1 2194. */
const view: QueryView = {
  periods: ["2193-Q1", "2193-Q2", "2193-Q3", "2193-Q4", "2194-Q1"],
  includeUndated: false,
  simulatedCells: rollUpSales(lines),
  version: "00000000000000f1",
};
/** Planning Q1 2194: the ledgers end at Q4 2193. */
const before: QueryView = {
  periods: ["2193-Q1", "2193-Q2", "2193-Q3", "2193-Q4"],
  includeUndated: false,
};

describe("relative quarters at query time", () => {
  it("give exactly the dated query's figures, and say what they resolved to", () => {
    const byGenre = (quarter: string[]): Query => ({
      measure: "revenue",
      by: ["genre"],
      filter: { quarter },
    });
    const relative = run(byGenre(["latest"]), view);
    const dated = run(byGenre(["2194-Q1"]), view);
    expect(relative.rows).toEqual(dated.rows);
    expect(relative.total).toBe(dated.total);
    expect(relative.resolved).toEqual({ latest: "2194-Q1" });
    expect(dated.resolved).toBeUndefined();
    // The same token before Q1 2194 is played is Q4 2193: it moves on as the game is played.
    expect(run(byGenre(["latest"]), before).resolved).toEqual({ latest: "2193-Q4" });
    expect(run(byGenre(["latest-1"]), before).total).toBe(run(byGenre(["2193-Q3"]), before).total);
  });

  it("match nothing for a quarter before the ledgers, rather than every quarter", () => {
    const result = run(
      { measure: "units", by: ["genre"], filter: { quarter: ["latest-4"] } },
      before,
    );
    expect(result.resolved).toEqual({ "latest-4": "2192-Q4" });
    expect(result.rows).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("work with last year and with comparing quarters", () => {
    const lastYear = run(
      { measure: "units", by: ["genre"], filter: { quarter: ["latest"] }, vs: "last_year" },
      view,
    );
    const dated = run(
      { measure: "units", by: ["genre"], filter: { quarter: ["2194-Q1"] }, vs: "last_year" },
      view,
    );
    expect(lastYear.lastYear).toEqual(dated.lastYear);
    const compared = run(
      { measure: "units", by: ["genre", "quarter"], filter: { quarter: ["latest-1", "latest"] } },
      view,
    );
    expect([...new Set(compared.rows.map((r) => r.quarter))].sort()).toEqual([
      "2193-Q4",
      "2194-Q1",
    ]);
  });

  it("accept the tokens in the quarter filter only, and dated quarters only by their names", () => {
    const refused = (query: unknown) => {
      try {
        runQuery(query, view, quiet);
        return null;
      } catch (error) {
        return error instanceof QueryError ? error.code : String(error);
      }
    };
    expect(refused({ measure: "units", by: ["genre"], filter: { quarter: ["latest-2"] } })).toBe(
      "INVALID_QUERY",
    );
    expect(refused({ measure: "units", by: ["genre"], filter: { quarter: ["Q1 2194"] } })).toBe(
      "INVALID_QUERY",
    );
    expect(refused({ measure: "units", by: ["genre"], filter: { month: ["latest"] } })).toBe(
      "INVALID_QUERY",
    );
    expect(
      refused({ measure: "units", by: ["genre"], filter: { quarter: ["latest-4"] } }),
    ).toBeNull();
  });
});
