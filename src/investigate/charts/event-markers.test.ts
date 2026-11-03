import { describe, expect, it } from "vitest";
import type { ChartEvent } from "~/query/events";
import {
  eventLines,
  eventsCaption,
  eventWhen,
  markerCounts,
  markersFor,
  withMarkers,
} from "./event-markers";

const release: ChartEvent = {
  date: "2194-02-04",
  precision: "day",
  kind: "release",
  label: "The Bourton Model Village Poisoning, Inspector Ryeslton volume 3",
};
const pick = (month: string, label: string): ChartEvent => ({
  date: `2194-${month}-01`,
  precision: "month",
  kind: "pick",
  label,
});
const move: ChartEvent = {
  date: "2194-01-01",
  precision: "quarter",
  kind: "move",
  label: "Re-pick Book of the Month",
};

describe("event markers (Plot's copy, section 7)", () => {
  it("writes when, month first, and the two tooltip lines", () => {
    expect(eventWhen(release)).toBe("February 4, 2194".replace("February", "Feb"));
    expect(eventWhen(pick("03", "Portmeirion, mass market paperback"))).toBe("March 2194");
    expect(eventWhen(move)).toBe("Q1 2194");
    expect(eventLines(release)).toEqual([
      "Feb 4, 2194 · Release",
      "The Bourton Model Village Poisoning, Inspector Ryeslton volume 3",
    ]);
    expect(eventLines(pick("03", "Portmeirion, mass market paperback"))[0]).toBe(
      "March 2194 · Book of the Month",
    );
    expect(eventLines({ ...release, group: { genre: "Mystery" } })[1]).toMatch(/\(Mystery\)$/);
  });

  it("puts each event on its month or quarter, and draws several there as one +n", () => {
    const months = ["2194-01", "2194-02", "2194-03"];
    const events = [
      move,
      pick("01", "The Mallemaroking, mass market paperback"),
      release,
      pick("02", "Rystwyth, hardcover"),
    ];
    const { markers, offAxis } = markersFor(events, "month", months);
    expect(markers.map((m) => [m.index, m.label])).toEqual([
      [0, "+2"],
      [1, "+2"],
    ]);
    expect(markers[1]!.events.map((e) => e.kind)).toEqual(["pick", "release"]);
    expect(offAxis).toBe(0);
    // By quarter, all four share Q1.
    expect(markersFor(events, "quarter", ["2194-Q1"]).markers).toHaveLength(1);
    // An event on no category shown counts as hidden.
    expect(markersFor(events, "month", ["2194-01"]).offAxis).toBe(2);
    expect(markersFor([release], "month", months).markers[0]!.label).toBe("Release");
    expect(markerCounts(markers)).toEqual({ release: 1, pick: 2, move: 1, event: 0 });
  });

  it("says when nothing is in the period, how many aren't drawn, and when labels are left off (Plot)", () => {
    const marker = (index: number) => ({ index, events: [release], label: "Release" });
    const few = [marker(0), marker(1), marker(2)];
    expect(eventsCaption([], 0)).toEqual(["No events in this period."]);
    expect(eventsCaption(few, 0)).toEqual([]);
    expect(eventsCaption(few, 1)).toEqual([
      "1 more event hidden: filter to one quarter to see them all",
    ]);
    expect(eventsCaption(few, 4)).toEqual([
      "4 more events hidden: filter to one quarter to see them all",
    ]);
    const many = Array.from({ length: 13 }, (_, i) => marker(i));
    expect(eventsCaption(many, 0)).toEqual([
      "Labels hidden for 13 events: filter to one quarter to see them.",
    ]);
    expect(eventsCaption(many, 2)).toEqual([
      "2 more events hidden: filter to one quarter to see them all",
      "Labels hidden for 13 events: filter to one quarter to see them.",
    ]);
  });

  it("adds a dashed line per marker on the first series, and the events to the tooltip", () => {
    const option = {
      tooltip: { formatter: () => "<b>Feb</b>" },
      series: [
        { type: "bar", data: [1, 2, 3] },
        { type: "bar", data: [1, 2, 3] },
      ],
    };
    const { markers } = markersFor([release], "month", ["2194-01", "2194-02"]);
    const marked = withMarkers(option, markers) as {
      series: { markLine?: { data: { xAxis: number; name: string }[] } }[];
      tooltip: { formatter: (p: { dataIndex: number }[]) => string };
    };
    expect(marked.series[0]!.markLine!.data).toEqual([{ xAxis: 1, name: "Release" }]);
    expect(marked.series[1]!.markLine).toBeUndefined();
    expect(marked.tooltip.formatter([{ dataIndex: 1 }])).toContain("Feb 4, 2194 · Release");
    expect(marked.tooltip.formatter([{ dataIndex: 0 }])).toBe("<b>Feb</b>");
    expect(withMarkers(option, [])).toBe(option);
    // Too many to label without collisions: lines and tooltips only.
    const many = Array.from({ length: 13 }, (_, i) => ({
      index: i,
      events: [release],
      label: "Release",
    }));
    const crowded = withMarkers(option, many) as {
      series: { markLine: { label: { show: boolean } } }[];
    };
    expect(crowded.series[0]!.markLine.label.show).toBe(false);
  });
});

describe("markers on % of total (Audit, #357)", () => {
  it("draw on the shares chart, at each month's place in its own order", async () => {
    const { categoryModel } = await import("./category-chart");
    const { shareModel, shareOption } = await import("./share-chart");
    const months = ["2194-01", "2194-02", "2194-03"];
    const result = {
      columns: [
        { key: "month", label: "Month", type: "string", nullable: false },
        { key: "revenue", label: "Revenue", type: "number", nullable: false },
      ],
      rows: months.map((month, i) => ({ month, revenue: 100 * (i + 1) })),
      total: 600,
      source: "test",
    } as const;
    const shares = shareModel(categoryModel(result as never, "month"), 600)!;
    const { markers } = markersFor([release], "month", shares.categories);
    const marked = withMarkers(shareOption(shares), markers) as {
      series: { markLine?: { data: { xAxis: number }[] } }[];
      tooltip: { formatter: (p: { dataIndex: number }[]) => string };
    };
    expect(marked.series[0]!.markLine!.data).toEqual([
      { xAxis: shares.categories.indexOf("2194-02"), name: "Release" },
    ]);
    expect(
      marked.tooltip.formatter([{ dataIndex: shares.categories.indexOf("2194-02") }]),
    ).toContain("Feb 4, 2194 · Release");
  });
});
