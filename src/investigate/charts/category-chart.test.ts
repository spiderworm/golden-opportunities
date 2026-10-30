import { describe, expect, it } from "vitest";
import type { QueryResult } from "~/query/types";
import { pinMonths } from "../pins/PinnedCharts";
import type { Pin } from "../pins/spec";
import { categoryModel } from "./category-chart";

const QUARTERS = ["2193-Q1", "2193-Q2", "2193-Q3", "2193-Q4"];

function result(rows: QueryResult["rows"], by: ("month" | "genre" | "quarter")[], measure: "units" | "avg_order_value" = "units"): QueryResult {
  return {
    columns: [...by.map((key) => ({ key, label: key, type: "string" as const, nullable: true })), { key: measure, label: measure, type: "number" as const, nullable: false }],
    rows,
    total: null,
    source: "test",
  };
}

describe("categoryModel", () => {
  it("shows a month in scope with no sales as zero", () => {
    const model = categoryModel(result([{ month: "02", units: 5 }], ["month"]), "month", null, ["01", "02", "03"]);
    expect(model.categories).toEqual(["01", "02", "03"]);
    expect(model.series[0]!.values).toEqual([0, 5, 0]);
  });

  it("leaves averages empty where nothing sold", () => {
    const model = categoryModel(result([{ month: "02", avg_order_value: 14 }], ["month"], "avg_order_value"), "month", null, ["01", "02"]);
    expect(model.series[0]!.values).toEqual([null, 14]);
  });

  // Audit's case: a pin filtered to March got zero bars for every other month.
  it("doesn't invent months a pin filtered out", () => {
    const pin: Pin = { id: "p", pinnedBy: "dewey", title: "March", kind: "bar", query: { measure: "units", by: ["month"], filter: { month: ["03"] } } };
    const months = pinMonths(pin, QUARTERS);
    expect(months).toEqual(["03"]);
    const model = categoryModel(result([{ month: "03", units: 9 }], ["month"]), "month", null, months);
    expect(model.categories).toEqual(["03"]);
    expect(model.series[0]!.values).toEqual([9]);
  });

  // Audit's case: rows cut off by the limit came back as zeros.
  it("shows no bar, not zero, for pairs a truncated result may have cut", () => {
    const rows = [
      { genre: "Fiction", quarter: "2193-Q1", units: 4 },
      { genre: "Fiction", quarter: "2193-Q2", units: 6 },
      { genre: "Memoir", quarter: "2193-Q1", units: 3 },
    ];
    const truncated = categoryModel(result(rows, ["genre", "quarter"]), "genre", "quarter", [], { limit: 3 });
    expect(truncated.series.find((s) => s.key === "2193-Q2")!.values).toEqual([6, null]);

    const complete = categoryModel(result(rows, ["genre", "quarter"]), "genre", "quarter", [], { limit: 10 });
    expect(complete.series.find((s) => s.key === "2193-Q2")!.values).toEqual([6, 0]);
  });

  it("doesn't pad a truncated month axis with months that may be missing", () => {
    const model = categoryModel(result([{ month: "01", units: 1 }, { month: "02", units: 2 }], ["month"]), "month", null, ["01", "02", "03"], { limit: 2 });
    expect(model.categories).toEqual(["01", "02"]);
  });
});
