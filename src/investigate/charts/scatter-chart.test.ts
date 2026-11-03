import { describe, expect, it } from "vitest";

import type { Dimension, Measure, QueryResult } from "~/query/types";
import { measuresModel } from "./measures-chart";
import { axisTitle, scatterOption, scatterPoints, scatterTitle } from "./scatter-chart";

const result = (measure: Measure, by: Dimension, rows: [string, number | null][]): QueryResult => ({
  columns: [
    { key: by, label: by, type: "string", nullable: false },
    { key: measure, label: measure, type: "number", nullable: true },
  ],
  rows: rows.map(([k, v]) => ({ [by]: k, [measure]: v })),
  total: null,
  source: `${measure} source.`,
});

describe("scatter plots (Plot's copy, #291)", () => {
  const revenue = result("revenue", "genre", [
    ["Fiction", 4120],
    ["Mystery", 2500],
    ["Poetry", 300],
  ]);
  const discount = result("avg_discount", "genre", [
    ["Mystery", 0.12],
    ["Fiction", 0.05],
    ["Poetry", null],
  ]);
  const model = measuresModel([revenue, discount], ["revenue", "avg_discount"], "genre");

  it("puts a point per group, the first measure across and the second up; a group missing either has no point", () => {
    expect(scatterPoints(model)).toEqual([
      { category: "Fiction", x: 4120, y: 0.05 },
      { category: "Mystery", x: 2500, y: 0.12 },
    ]);
  });

  it("titles the chart and its axes as the copy says", () => {
    expect(scatterTitle(["revenue", "units"], "title")).toBe(
      "Units sold against revenue, by title",
    );
    expect(axisTitle("revenue")).toBe("Revenue ($)");
    expect(axisTitle("units")).toBe("Units sold");
    expect(axisTitle("avg_discount")).toBe("Average discount (%)");
    expect(axisTitle("avg_rating")).toBe("Average rating (stars)");
    const option = scatterOption(model) as { xAxis: { name: string }; yAxis: { name: string } };
    expect([option.xAxis.name, option.yAxis.name]).toEqual(["Revenue ($)", "Average discount (%)"]);
  });

  it("names a point's group and both values in its tooltip, and labels no points", () => {
    const option = scatterOption(model) as {
      tooltip: { formatter: (p: { dataIndex: number }) => string };
      series: { label?: { show: boolean }; data: unknown[] }[];
    };
    const tip = option.tooltip.formatter({ dataIndex: 1 });
    expect(tip).toContain("Mystery");
    expect(tip).toContain("Revenue:</span> <strong>$2,500</strong>");
    expect(tip).toContain("Average discount:</span> <strong>12.0%</strong>");
    expect(option.series[0]!.label?.show ?? false).toBe(false);
    expect(option.series[0]!.data).toHaveLength(2);
    expect((option.series[0] as { name?: string }).name).toBe("Average discount against revenue");
  });

  it("dims the groups not chosen once some are", () => {
    const option = scatterOption(model, { selected: ["Mystery"] }) as {
      series: { data: { itemStyle: { color: string } }[] }[];
    };
    const [fiction, mystery] = option.series[0]!.data.map((d) => d.itemStyle.color);
    expect(fiction).not.toBe(mystery);
  });

  it("escapes a group's name in the tooltip", () => {
    const odd = measuresModel(
      [
        result("revenue", "title", [["<b>Odd</b>", 10]]),
        result("units", "title", [["<b>Odd</b>", 2]]),
      ],
      ["revenue", "units"],
      "title",
    );
    const option = scatterOption(odd) as {
      tooltip: { formatter: (p: { dataIndex: number }) => string };
    };
    expect(option.tooltip.formatter({ dataIndex: 0 })).not.toContain("<b>Odd</b>");
  });
});
