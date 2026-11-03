import { describe, expect, it } from "vitest";
import type { Dimension, Measure, QueryResult } from "~/query/types";
import { categoryModel } from "./charts/category-chart";
import { chartShare } from "./MeasureChart";
import { DEFAULT_STATE, type InvestigateState } from "./state";

const QUARTERS = ["2193-Q1", "2193-Q2", "2193-Q3", "2193-Q4"];
const state = (over: Partial<InvestigateState>): InvestigateState => ({
  ...DEFAULT_STATE,
  ...over,
});

function result(
  rows: QueryResult["rows"],
  by: Dimension[],
  measure: Measure,
  total: number | null = null,
): QueryResult {
  return {
    columns: [
      ...by.map((key) => ({ key, label: key, type: "string" as const, nullable: true })),
      { key: measure, label: measure, type: "number" as const, nullable: false },
    ],
    rows,
    total,
    source: "test",
  };
}

// Audit's probes on #59.
describe("the tooltip's share of a period", () => {
  it("leaves orders out when comparing quarters: an order can span groups, so the groups overcount the quarter", () => {
    // Q3 by genre: the groups sum to 20,638 orders, but the quarter had 19,534.
    const r = result(
      [
        { genre: "Childrens", quarter: "2193-Q3", orders: 2835 },
        { genre: "Fiction", quarter: "2193-Q3", orders: 17_803 },
      ],
      ["genre", "quarter"],
      "orders",
    );
    const model = categoryModel(r, "genre", "quarter", []);
    expect(
      chartShare(state({ measure: "orders", by: "genre", compare: true }), model, 19_534, QUARTERS),
    ).toBeUndefined();
    // Units add up across groups, so the quarter's share stands.
    const units = categoryModel(
      result(
        [
          { genre: "Childrens", quarter: "2193-Q3", units: 30 },
          { genre: "Fiction", quarter: "2193-Q3", units: 70 },
        ],
        ["genre", "quarter"],
        "units",
      ),
      "genre",
      "quarter",
      [],
    );
    const share = chartShare(
      state({ measure: "units", by: "genre", compare: true }),
      units,
      null,
      QUARTERS,
    )!;
    expect([share.total(0), share.period(0)]).toEqual([100, "Q3 2193"]);
  });

  it("uses the query's own distinct total for orders when not comparing", () => {
    const model = categoryModel(
      result([{ genre: "Childrens", orders: 2835 }], ["genre"], "orders", 19_534),
      "genre",
      null,
      [],
    );
    const share = chartShare(state({ measure: "orders", by: "genre" }), model, 19_534, QUARTERS)!;
    expect([share.total(0), share.period(0)]).toEqual([19_534, "2193"]);
  });

  it("names the period the query covers: grouped by quarter, a quarter filter doesn't narrow it", () => {
    const model = categoryModel(
      result([{ quarter: "2193-Q1", revenue: 95_246 }], ["quarter"], "revenue", 677_000),
      "quarter",
      null,
      [],
    );
    const byQuarter = chartShare(
      state({ measure: "revenue", by: "quarter", filters: { quarter: ["2193-Q4"] } }),
      model,
      677_000,
      QUARTERS,
    )!;
    expect(byQuarter.period(0)).toBe("2193");
    const byGenre = chartShare(
      state({ measure: "revenue", by: "genre", filters: { quarter: ["2193-Q4"] } }),
      model,
      161_525,
      QUARTERS,
    )!;
    expect(byGenre.period(0)).toBe("Q4 2193");
  });

  it("leaves the share out for averages and for filtered slices", () => {
    const model = categoryModel(
      result([{ genre: "Fiction", revenue: 1 }], ["genre"], "revenue", 1),
      "genre",
      null,
      [],
    );
    expect(
      chartShare(state({ measure: "avg_order_value", by: "genre" }), model, 1, QUARTERS),
    ).toBeUndefined();
    expect(
      chartShare(
        state({ measure: "revenue", by: "genre", filters: { format: ["Hardcover"] } }),
        model,
        1,
        QUARTERS,
      ),
    ).toBeUndefined();
  });
});
