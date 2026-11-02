import { describe, expect, it } from "vitest";
import type { QueryResult } from "~/query/types";
import { pinMonths } from "../pins/PinnedCharts";
import type { Pin } from "../pins/spec";
import { categoryModel, categoryOption, nothingToDraw } from "./category-chart";

const QUARTERS = ["2193-Q1", "2193-Q2", "2193-Q3", "2193-Q4"];

function result(rows: QueryResult["rows"], by: ("month" | "genre" | "quarter" | "list_price" | "price_band" | "edition")[], measure: "units" | "avg_order_value" | "avg_discount" = "units"): QueryResult {
  return {
    columns: [...by.map((key) => ({ key, label: key, type: "string" as const, nullable: true })), { key: measure, label: measure, type: "number" as const, nullable: false }],
    rows,
    total: null,
    source: "test",
  };
}

describe("categoryModel", () => {
  it("shows a month in scope with no sales as zero", () => {
    const model = categoryModel(result([{ month: "2193-02", units: 5 }], ["month"]), "month", null, ["2193-01", "2193-02", "2193-03"]);
    expect(model.categories).toEqual(["2193-01", "2193-02", "2193-03"]);
    expect(model.series[0]!.values).toEqual([0, 5, 0]);
  });

  it("orders prices cheapest first, and ranks editions as it does titles", () => {
    const prices = categoryModel(result([{ list_price: "$24.99", units: 1 }, { list_price: "$9.99", units: 2 }, { list_price: "$12.50", units: 3 }], ["list_price"]), "list_price");
    expect(prices.categories).toEqual(["$9.99", "$12.50", "$24.99"]);
    const bands = categoryModel(result([{ price_band: "$30 and up", units: 1 }, { price_band: "under $10", units: 2 }, { price_band: "$10 to $19.99", units: 3 }], ["price_band"]), "price_band");
    expect(bands.categories).toEqual(["under $10", "$10 to $19.99", "$30 and up"]);
    const editions = categoryModel(result([{ edition: "A (Paperback)", units: 1 }, { edition: "B (Hardcover)", units: 9 }], ["edition"]), "edition");
    expect([editions.horizontal, editions.categories]).toEqual([true, ["B (Hardcover)", "A (Paperback)"]]);
  });

  it("leaves averages empty where nothing sold", () => {
    const model = categoryModel(result([{ month: "2193-02", avg_order_value: 14 }], ["month"], "avg_order_value"), "month", null, ["2193-01", "2193-02"]);
    expect(model.series[0]!.values).toEqual([null, 14]);
  });

  // Audit's case: a pin filtered to March got zero bars for every other month.
  it("doesn't invent months a pin filtered out", () => {
    const pin: Pin = { id: "p", pinnedBy: "dewey", title: "March", kind: "bar", query: { measure: "units", by: ["month"], filter: { month: ["2193-03"] } } };
    const months = pinMonths(pin, QUARTERS);
    expect(months).toEqual(["2193-03"]);
    const model = categoryModel(result([{ month: "2193-03", units: 9 }], ["month"]), "month", null, months);
    expect(model.categories).toEqual(["2193-03"]);
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
    const model = categoryModel(result([{ month: "2193-01", units: 1 }, { month: "2193-02", units: 2 }], ["month"]), "month", null, ["2193-01", "2193-02", "2193-03"], { limit: 2 });
    expect(model.categories).toEqual(["2193-01", "2193-02"]);
  });
});

describe("the bar tooltip", () => {
  type Formatter = (params: { dataIndex: number; seriesIndex: number; seriesName: string; value: number | null; color: string }[]) => string;
  const tooltip = (option: ReturnType<typeof categoryOption>) => (option.tooltip as { formatter: Formatter }).formatter;
  const model = categoryModel(result([{ genre: "Fantasy", units: 30 }, { genre: "Poetry", units: 10 }], ["genre"]), "genre", null, []);

  it("adds {share}% of {period} when given the whole, and Plot's hint", () => {
    const format = tooltip(categoryOption(model, { quarters: QUARTERS, share: { total: () => 40, period: () => "2193" } }));
    const html = format([{ dataIndex: 0, seriesIndex: 0, seriesName: "Units sold", value: 30, color: "#fff" }]);
    expect(html).toContain("75% of 2193");
    expect(html).toContain("Click to look closer");
  });

  it("leaves the share out when the bars aren't the whole", () => {
    const html = tooltip(categoryOption(model, { quarters: QUARTERS }))([{ dataIndex: 0, seriesIndex: 0, seriesName: "Units sold", value: 30, color: "#fff" }]);
    expect(html).not.toContain("% of");
  });
});

describe("the value axis", () => {
  // The axis as ECharts draws it, from the server-side SVG renderer.
  const labels = async (measure: "units" | "avg_order_value" | "avg_discount", values: number[]) => {
    const { init } = await import("~/platform/charts/echarts-setup");
    const chart = init(null as never, null, { renderer: "svg", ssr: true, width: 600, height: 300 });
    chart.setOption(categoryOption(categoryModel(result(values.map((v, i) => ({ month: `2193-0${i + 1}`, [measure]: v })), ["month"], measure), "month"), { quarters: QUARTERS }) as never);
    const svg = chart.renderToSVGString();
    chart.dispose();
    return [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]!).filter((t) => !/^[A-Z][a-z]{2}$/.test(t));
  };

  it("never ticks between whole units", async () => {
    // Before: 0 | 0.3 | 0.6 | 0.9 | 1.2.
    expect(await labels("units", [0, 1, 0])).toEqual(["0", "1"]);
  });

  it("shows totals of zero as no sales, but draws an average of zero, which is a figure (Audit, #254)", async () => {
    const model = (measure: "units" | "avg_discount", values: (number | null)[]) =>
      categoryModel(result(values.map((v, i) => ({ month: `2193-0${i + 1}`, [measure]: v })), ["month"], measure), "month");
    expect(nothingToDraw(model("units", [0, 0]).series, ["units"])).toBe(true);
    expect(nothingToDraw(model("units", [0, 1]).series, ["units"])).toBe(false);
    // 0% everywhere: Q1 with nothing discounted, or a discounted:no filter.
    expect(nothingToDraw(model("avg_discount", [0, 0]).series, ["avg_discount"])).toBe(false);
    expect(nothingToDraw(model("avg_discount", [null, null]).series, ["avg_discount"])).toBe(true);
    // Beside a total, an average of zero still draws.
    expect(nothingToDraw([{ values: [0, 0] }, { values: [0, 0] }], ["units", "avg_discount"])).toBe(false);
    expect(nothingToDraw([{ values: [0, 0] }, { values: [null, null] }], ["units", "avg_discount"])).toBe(true);
    // Drawn, its axis reads as percents from zero.
    expect((await labels("avg_discount", [0, 0, 0]))[0]).toBe("0.0%");
  });

});
