import { describe, expect, it } from "vitest";
import type { QueryResult } from "~/query/types";
import { categoryModel, categoryOption } from "./category-chart";
import {
  changeLine,
  formatDelta,
  formatPercent,
  lastYearLabels,
  lastYearRows,
  withLastYear,
} from "./last-year";

const result: QueryResult = {
  columns: [
    { key: "genre", label: "Genre", type: "string", nullable: true },
    { key: "revenue", label: "Revenue", type: "number", nullable: false },
  ],
  rows: [
    { genre: "Fiction", revenue: 41200 },
    { genre: "Memoir", revenue: 400 },
    { genre: "Poetry", revenue: 0 },
  ],
  total: 41600,
  source: "test",
  lastYear: {
    rows: [{ value: 38900 }, { value: 0 }, { value: 120 }],
    total: { value: 39020 },
    evidence: {
      rows: [
        { n: 950, se: 1300 },
        { n: 0, se: 0 },
        { n: 4, se: 60 },
      ],
      total: { n: 954, se: 1310 },
    },
  },
};

describe("the words for last year (Plot, #291)", () => {
  it("names the quarters, and by month the years", () => {
    expect(lastYearLabels("2194-Q1", "genre")).toMatchObject({
      now: "Q1 2194",
      then: "Q1 2193",
      legend: ["Q1 2194", "Q1 2193"],
    });
    expect(lastYearLabels("2194-Q1", "month").legend).toEqual(["2194", "2193"]);
  });

  it("signs the difference and the change, in points for average discount", () => {
    expect(formatDelta("revenue", 2300)).toBe("+$2,300");
    expect(formatDelta("units", -140)).toBe("-140");
    expect(formatDelta("avg_discount", 0.023)).toBe("+2.3 pts");
    expect(formatDelta("units", 0)).toBe("0");
    expect(formatPercent("revenue", 0.228)).toBe("+22.8%");
    expect(formatPercent("revenue", -0.041)).toBe("-4.1%");
    expect(formatPercent("revenue", 0)).toBe("0.0%");
    expect(formatPercent("revenue", -1)).toBe("-100.0%");
    expect(formatPercent("revenue", "new")).toBe("New");
    expect(formatPercent("avg_discount", 0.5)).toBe("");
  });

  it("writes the tooltip's change line", () => {
    expect(changeLine("revenue", 41200, { value: 38900 })).toBe("Change: +$2,300 (+5.9%)");
    expect(changeLine("revenue", 400, { value: 0 })).toBe("Change: +$400 (New)");
    expect(changeLine("avg_discount", 0.123, { value: 0.1 })).toBe("Change: +2.3 pts");
    expect(changeLine("revenue", 400, null)).toBeNull();
  });

  it("fills the table: a zero reads as zero, no figure as None", () => {
    expect(lastYearRows(result, "genre", "revenue")).toEqual([
      { group: "Fiction", now: "$41,200", then: "$38,900", delta: "+$2,300", percent: "+5.9%" },
      { group: "Memoir", now: "$400", then: "$0", delta: "+$400", percent: "New" },
      { group: "Poetry", now: "$0", then: "$120", delta: "-$120", percent: "-100.0%" },
    ]);
    const averages: QueryResult = {
      ...result,
      columns: [result.columns[0]!, { ...result.columns[1]!, key: "avg_discount" }],
      rows: [{ genre: "Fiction", avg_discount: 0.1 }],
      lastYear: {
        rows: [{ value: null }],
        total: null,
        evidence: { rows: [{ n: 0, se: null }], total: null },
      },
    };
    expect(lastYearRows(averages, "genre", "avg_discount")).toEqual([
      { group: "Fiction", now: "10.0%", then: "None", delta: "", percent: "" },
    ]);
  });

  it("draws last year as a lighter second series in this year's color", () => {
    const labels = lastYearLabels("2194-Q1", "genre");
    const model = withLastYear(categoryModel(result, "genre"), result, labels);
    expect(model.series.map((s) => s.key)).toEqual(["2194-Q1", "2193-Q1"]);
    expect(model.series[1]!.values).toEqual([38900, 0, 120]);
    const option = categoryOption(model, {
      quarters: ["2193-Q1", "2194-Q1"],
      ghost: { change: () => null },
    }) as { series: { itemStyle: { color: string; opacity: number } }[] };
    expect(option.series[1]!.itemStyle.color).toBe(option.series[0]!.itemStyle.color);
    expect(option.series[1]!.itemStyle.opacity).toBeLessThan(1);
  });
});
