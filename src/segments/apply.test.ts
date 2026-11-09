import { describe, expect, it } from "vitest";
import type { ChartPinSpec, PinSpec } from "../investigate/pins/spec";
import { filterOf, intersect, segmented, segmentUses } from "./apply";
import type { Segment } from "./segments";

const quarters = ["2193-Q3", "2193-Q4", "2194-Q1"];
const paperbacks: Segment = {
  id: "s1",
  name: "Paperbacks",
  filters: { format: ["Trade paperback"], genre: ["Fiction", "Mystery"] },
};
const fiction: Segment = { id: "s2", name: "Fiction", filters: { genre: ["Fiction"] } };

/** Revenue by genre, pinned with Paperbacks on: the bar's filters but its own breakdown's. */
const byGenre: ChartPinSpec = {
  title: "Revenue by genre",
  kind: "bar",
  query: { measure: "revenue", by: ["genre"], filter: { format: ["Trade paperback"] } },
  segment: "s1",
};

describe("a chart's own segment", () => {
  it("gives it the segment's filters now, less the breakdown it draws", () => {
    const edited: Segment = {
      ...paperbacks,
      filters: { format: ["Hardcover"], genre: ["Fiction"] },
    };
    const run = segmented(byGenre, [edited], quarters);
    expect(run.segment).toBe(edited);
    expect(filterOf(run.spec!)).toEqual({ format: ["Hardcover"] });
    expect(run.empty).toBeNull();
  });

  it("once the segment's deleted, shows the filters it was pinned with, and says so", () => {
    const run = segmented(byGenre, [fiction], quarters);
    expect(run.segment).toBe("deleted");
    expect(run.spec).toBe(byGenre);
  });

  it("keeps a heatmap's quarters and a waterfall's breakdown and quarters", () => {
    const withQuarters: Segment = {
      ...paperbacks,
      filters: { ...paperbacks.filters, quarter: ["2193-Q3"], weekday: ["Mon"] },
    };
    const heat: PinSpec = {
      title: "Revenue by weekday and month",
      kind: "heatmap",
      query: {
        measure: "revenue",
        by: ["weekday", "month"],
        filter: { quarter: ["2193-Q4", "2194-Q1"] },
      },
      segment: "s1",
    };
    expect(filterOf(segmented(heat, [withQuarters], quarters).spec!)).toEqual({
      format: ["Trade paperback"],
      genre: ["Fiction", "Mystery"],
      quarter: ["2193-Q4", "2194-Q1"],
    });
    const drove: PinSpec = {
      title: "What drove revenue's change",
      kind: "waterfall",
      waterfall: { by: "genre", then: "latest-1", now: "latest" },
      segment: "s1",
    };
    expect(filterOf(segmented(drove, [withQuarters], quarters).spec!)).toEqual({
      format: ["Trade paperback"],
      weekday: ["Mon"],
    });
  });

  it("leaves a chart without one as it is", () => {
    const { segment: _s, ...plain } = byGenre;
    expect(segmented(plain, [paperbacks], quarters)).toEqual({
      spec: plain,
      segment: null,
      empty: null,
    });
  });
});

describe("a report's segment, as AND with each chart's filters", () => {
  it("narrows every chart, the dimension it draws included", () => {
    const { segment: _s, ...plain } = byGenre;
    const run = segmented(plain, [], quarters, fiction);
    expect(filterOf(run.spec!)).toEqual({ format: ["Trade paperback"], genre: ["Fiction"] });
  });

  it("comes after the chart's own segment", () => {
    const run = segmented(byGenre, [paperbacks, fiction], quarters, fiction);
    expect(run.segment).toBe(paperbacks);
    expect(filterOf(run.spec!)).toEqual({ format: ["Trade paperback"], genre: ["Fiction"] });
  });

  it("names itself when nothing matches both, rather than dropping either", () => {
    const hardcover: Segment = { id: "s3", name: "Hardcovers", filters: { format: ["Hardcover"] } };
    expect(segmented(byGenre, [paperbacks], quarters, hardcover)).toEqual({
      spec: null,
      segment: paperbacks,
      empty: hardcover,
    });
  });

  it("can't narrow a comparison's two sides or a waterfall's quarters", () => {
    const comparison: PinSpec = {
      title: "Fiction against Mystery",
      kind: "comparison",
      comparison: {
        measure: "revenue",
        across: "genre",
        from: "Fiction",
        to: "Mystery",
        by: [],
      },
    };
    const run = segmented(comparison, [], quarters, paperbacks);
    expect(filterOf(run.spec!)).toEqual({ format: ["Trade paperback"] });
    const lastQuarter: Segment = {
      id: "s4",
      name: "Last quarter",
      filters: { quarter: ["2193-Q3"] },
    };
    const drove: PinSpec = {
      title: "What drove revenue's change",
      kind: "waterfall",
      waterfall: { by: "genre", then: "2193-Q4", now: "2194-Q1" },
    };
    expect(segmented(drove, [], quarters, lastQuarter).spec).toEqual(drove);
  });

  it("reads relative quarters as the quarters they are now", () => {
    expect(
      intersect({ quarter: ["latest"] }, { quarter: ["2194-Q1", "2193-Q4"] }, quarters),
    ).toEqual({ quarter: ["2194-Q1"] });
    expect(intersect({ quarter: ["2193-Q3"] }, { quarter: ["latest-1"] }, quarters)).toBeNull();
    // Without a relative quarter, the values stay as they are.
    expect(intersect({ quarter: ["latest"] }, { genre: ["Fiction"] }, quarters)).toEqual({
      quarter: ["latest"],
      genre: ["Fiction"],
    });
  });
});

describe("what uses a segment, for Delete's question", () => {
  it("counts the pins that carry it, and the reports that have it or hold a chart that does", () => {
    const { segment: _s, ...plain } = byGenre;
    const reports = [
      { segment: "s1", items: [{ spec: plain }] },
      { items: [{ spec: byGenre }] },
      { segment: "s2", items: [{ spec: plain }] },
    ];
    expect(segmentUses("s1", [byGenre, plain, byGenre], reports)).toEqual({ pins: 2, reports: 2 });
    expect(segmentUses("s9", [byGenre], reports)).toEqual({ pins: 0, reports: 0 });
  });
});
