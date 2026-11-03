import { describe, expect, it } from "vitest";

import type { Dimension, Measure, QueryResult } from "~/query/types";
import { measureColor, measuresModel, measuresOption, measuresTable } from "./measures-chart";

const result = (measure: Measure, by: Dimension, rows: [string, number][]): QueryResult => ({
  columns: [
    { key: by, label: by, type: "string", nullable: false },
    { key: measure, label: measure, type: "number", nullable: false },
  ],
  rows: rows.map(([k, v]) => ({ [by]: k, [measure]: v })),
  total: null,
  source: `${measure} source.`,
});

describe("several measures in one chart", () => {
  const revenue = result("revenue", "genre", [
    ["Fiction", 900],
    ["Mystery", 500],
  ]);
  const units = result("units", "genre", [
    ["Mystery", 40],
    ["Fiction", 70],
  ]);
  const orders = result("orders", "genre", [["Fiction", 60]]);

  it("lines up each measure on the first one's categories, one axis per unit, colored for its first measure", () => {
    const model = measuresModel([revenue, units, orders], ["revenue", "units", "orders"], "genre");
    expect(model.categories).toEqual(["Fiction", "Mystery"]);
    expect(model.measures.map((m) => [m.measure, m.axis, m.values])).toEqual([
      ["revenue", 0, [900, 500]],
      ["units", 1, [70, 40]],
      ["orders", 1, [60, 0]],
    ]);
    expect(model.axes).toEqual([
      { measures: ["revenue"], color: measureColor(0) },
      { measures: ["units", "orders"], color: measureColor(1) },
    ]);
    expect(model.kind).toBe("bar");
    expect(measuresModel([revenue, units], ["revenue", "units"], "month").kind).toBe("line");
  });

  it("leaves a missing total as no value when the server says it left rows out", () => {
    const cut = { ...orders, truncated: true };
    expect(
      measuresModel([revenue, cut], ["revenue", "orders"], "genre").measures[1]!.values,
    ).toEqual([60, null]);
    expect(
      measuresModel([revenue, { ...orders, truncated: false }], ["revenue", "orders"], "genre")
        .measures[1]!.values,
    ).toEqual([60, 0]);
  });

  it("draws a series per shown measure on its own axis, with each axis named and colored", () => {
    const model = measuresModel([revenue, units], ["revenue", "units"], "genre");
    const option = measuresOption(model) as {
      yAxis: { name: string; position: string; axisLabel: { color: string } }[];
      series: { yAxisIndex: number; name: string }[];
    };
    expect(option.yAxis.map((a) => [a.name, a.position, a.axisLabel.color])).toEqual([
      ["Revenue", "left", measureColor(0)],
      ["Units sold", "right", measureColor(1)],
    ]);
    expect(option.series.map((s) => [s.name, s.yAxisIndex])).toEqual([
      ["Revenue", 0],
      ["Units sold", 1],
    ]);
    // Hidden in the legend: not drawn, and the axes stay.
    const hidden = measuresOption(model, { hidden: ["units"] }) as {
      yAxis: unknown[];
      series: unknown[];
    };
    expect(hidden.series).toHaveLength(1);
    expect(hidden.yAxis).toHaveLength(2);
  });

  it("makes one table of them: a row per category, a column per measure", () => {
    const model = measuresModel([revenue, units], ["revenue", "units"], "genre");
    expect(measuresTable(model, [revenue, units]).rows).toEqual([
      { genre: "Fiction", revenue: 900, units: 70 },
      { genre: "Mystery", revenue: 500, units: 40 },
    ]);
  });
});
