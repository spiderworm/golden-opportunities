import { describe, expect, it } from "vitest";
import type { Query } from "~/query/types";
import { DEFAULT_STATE } from "../state";
import {
  addPin,
  noChart,
  drawnKind,
  MAX_PINS,
  parsePins,
  parsePinSpec,
  pinKey,
  shownAsTable,
  waterfallPinFor,
  type Pin,
  type PinSpec,
} from "./spec";

const spec = {
  title: "Revenue by quarter",
  kind: "bar",
  query: { measure: "revenue", by: ["quarter"] },
} as const;
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v));

describe("pin specs", () => {
  it("keeps a scatter plot: two measures across one grouping that isn't time", () => {
    const scatter = {
      title: "Units sold against revenue, by title",
      kind: "scatter",
      query: { measure: "revenue", by: ["title"], filter: { genre: ["Mystery"] } },
      also: ["units"],
    } as const;
    expect(parsePinSpec(copy(scatter))).toEqual(scatter);
    // One measure, three, a breakdown over time, two breakdowns, or none: not a scatter plot.
    expect(parsePinSpec({ ...copy(scatter), also: undefined })).toBeNull();
    expect(parsePinSpec({ ...copy(scatter), also: ["units", "orders"] })).toBeNull();
    for (const by of [["month"], ["weekday"], ["title", "quarter"], []])
      expect(
        parsePinSpec({ ...copy(scatter), query: { measure: "revenue", by } }),
        by.join(),
      ).toBeNull();
    // A scatter plot and the bars of the same query are two pins.
    const pinned = parsePinSpec(copy(scatter))!;
    expect(pinKey(pinned)).not.toBe(pinKey({ ...pinned, kind: "bar" } as PinSpec));
  });

  it("keeps a heatmap: one measure down one grid dimension and across another", () => {
    const heat = {
      title: "Units sold by genre and price band",
      kind: "heatmap",
      query: { measure: "units", by: ["genre", "price_band"], filter: { quarter: ["2193-Q4"] } },
    };
    expect(parsePinSpec(copy(heat))).toEqual(heat);
    expect(pinKey(heat as PinSpec)).not.toBe(pinKey({ ...heat, kind: "table" } as PinSpec));
    for (const by of [["genre"], ["genre", "title"], ["genre", "genre"]])
      expect(parsePinSpec({ ...copy(heat), query: { measure: "units", by } })).toBeNull();
    expect(
      parsePinSpec({ ...copy(heat), query: { measure: "avg_rating", by: ["genre", "quarter"] } }),
    ).toBeNull();
    expect(parsePinSpec({ ...copy(heat), also: ["orders"] })).toBeNull();
  });

  it("keeps a chart's other measures only while they fit one chart, and tells such pins apart", () => {
    const two = { ...copy(spec), also: ["units"] };
    expect(parsePinSpec(two)).toEqual(two);
    // Saved under an older rule, or a third axis: the pin keeps what fits rather than going.
    expect(parsePinSpec({ ...copy(spec), also: ["units", "avg_order_value"] })).toEqual({
      ...spec,
      also: ["units"],
    });
    expect(parsePinSpec({ ...copy(spec), also: ["units", "avg_discount"] })).toEqual({
      ...spec,
      also: ["units"],
    });
    expect(
      parsePinSpec({
        ...copy(spec),
        query: { measure: "units", by: ["quarter"] },
        also: ["avg_discount", "avg_order_value"],
      }),
    ).toEqual({
      ...spec,
      query: { measure: "units", by: ["quarter"] },
      also: ["avg_discount"],
    });
    expect(
      parsePinSpec({ ...copy(spec), also: ["units", "orders", "avg_order_value"] }),
    ).toBeNull();
    expect(parsePinSpec({ ...copy(spec), also: ["bogus"] })).toBeNull();
    expect(parsePinSpec({ ...copy(spec), also: ["revenue"] })).toBeNull();
    expect(parsePinSpec({ ...copy(spec), also: [] })).toBeNull();
    expect(
      parsePinSpec({
        ...copy(spec),
        query: { measure: "avg_rating", by: ["quarter"] },
        also: ["units"],
      }),
    ).toBeNull();
    expect(pinKey(two as PinSpec)).not.toBe(pinKey(spec));
  });

  it("accepts Dewey's chart shape", () => {
    expect(parsePinSpec(copy(spec))).toEqual(spec);
    expect(
      parsePinSpec({
        ...copy(spec),
        query: { measure: "units", by: [], filter: { discount_rate: ["15%"] }, limit: 20 },
      }),
    ).not.toBeNull();
  });

  it("rejects anything outside the contract", () => {
    expect(parsePinSpec({ ...copy(spec), kind: "pie" })).toBeNull();
    expect(parsePinSpec({ ...copy(spec), title: "" })).toBeNull();
    expect(parsePinSpec({ ...copy(spec), extra: 1 })).toBeNull();
    expect(parsePinSpec({ ...copy(spec), query: { measure: "profit", by: [] } })).toBeNull();
    expect(
      parsePinSpec({ ...copy(spec), query: { measure: "units", by: ["genre", "genre"] } }),
    ).toBeNull();
    expect(
      parsePinSpec({
        ...copy(spec),
        query: { measure: "units", by: ["genre", "format", "month"] },
      }),
    ).toBeNull();
    expect(
      parsePinSpec({
        ...copy(spec),
        query: { measure: "units", by: [], filter: { colour: ["red"] } },
      }),
    ).toBeNull();
    expect(
      parsePinSpec({ ...copy(spec), query: { measure: "units", by: [], view: { periods: [] } } }),
    ).toBeNull();
  });

  it("reads stored pins, dropping malformed ones", () => {
    const stored = [
      { ...copy(spec), id: "a", pinnedBy: "dewey" },
      { ...copy(spec), id: "b", pinnedBy: "someone" },
      "junk",
    ];
    expect(parsePins(JSON.stringify(stored)).map((p) => p.id)).toEqual(["a"]);
    expect(parsePins("not json")).toEqual([]);
    expect(parsePins(null)).toEqual([]);
  });

  it("treats the same query as the same chart, whatever the filter order or its chart-or-table view", () => {
    const a = {
      measure: "units",
      by: [],
      filter: { genre: ["Memoir", "Fiction"], format: ["Hardcover"] },
    } as const;
    const b = {
      measure: "units",
      by: [],
      filter: { format: ["Hardcover"], genre: ["Fiction", "Memoir"] },
    } as const;
    const pin = (kind: "bar" | "table", query: Query): PinSpec => ({ title: "Units", kind, query });
    expect(pinKey(pin("bar", copy(a)))).toBe(
      pinKey({ ...pin("bar", copy(b)), title: "Another title" }),
    );
    // One chart, shown as bars or as its table: one pin since the Table toggle (Sage, #302).
    expect(pinKey(pin("bar", copy(a)))).toBe(pinKey(pin("table", copy(a))));
  });

  it("keeps the newest first, moves a repeat to the front, and caps the board", () => {
    let pins: Pin[] = [];
    pins = addPin(pins, copy(spec), "player", "1");
    pins = addPin(
      pins,
      { ...copy(spec), query: { measure: "units", by: ["month"] } },
      "dewey",
      "2",
    );
    pins = addPin(pins, { ...copy(spec), title: "Same chart, new title" }, "dewey", "3");
    expect(pins.map((p) => p.id)).toEqual(["3", "2"]);
    for (let i = 0; i < MAX_PINS + 2; i++)
      pins = addPin(
        pins,
        { ...copy(spec), query: { measure: "units", by: [], limit: i + 1 } },
        "player",
        `x${i}`,
      );
    expect(pins).toHaveLength(MAX_PINS);
    expect(pins[0]!.id).toBe(`x${MAX_PINS + 1}`);
  });

  const comparison = {
    title: "Revenue compared across quarter",
    kind: "comparison",
    comparison: {
      measure: "revenue",
      across: "quarter",
      from: "2193-Q3",
      to: "2193-Q4",
      by: ["genre"],
    },
  } as const;

  it("accepts Dewey's comparison shape, checked as Dewey checks it", () => {
    expect(parsePinSpec(copy(comparison))).toEqual(comparison);
    const filtered = {
      ...copy(comparison),
      comparison: { ...copy(comparison.comparison), by: [], filter: { format: ["Hardcover"] } },
    };
    expect(parsePinSpec(filtered)).toEqual(filtered);
    const bad = (change: object) =>
      parsePinSpec({
        ...copy(comparison),
        comparison: { ...copy(comparison.comparison), ...change },
      });
    expect(bad({ to: "2193-Q3" })).toBeNull();
    expect(bad({ from: "" })).toBeNull();
    expect(bad({ from: "x".repeat(500) })).toBeNull();
    expect(bad({ by: ["genre", "format"] })).toBeNull();
    expect(bad({ by: ["quarter"] })).toBeNull();
    expect(bad({ across: "colour" })).toBeNull();
    expect(bad({ measure: "profit" })).toBeNull();
    expect(bad({ filter: { quarter: ["2193-Q1"] } })).toBeNull();
    expect(bad({ filter: { colour: ["red"] } })).toBeNull();
    expect(bad({ rows: [] })).toBeNull();
  });

  it("never reads one kind as the other", () => {
    // Each variant has its own keys: a comparison carrying a query, or a chart carrying a comparison, is dropped.
    expect(parsePinSpec({ ...copy(comparison), query: copy(spec.query) })).toBeNull();
    expect(parsePinSpec({ ...copy(spec), comparison: copy(comparison.comparison) })).toBeNull();
    expect(parsePinSpec({ ...copy(spec), kind: "comparison" })).toBeNull();
    expect(
      parsePinSpec({ title: spec.title, kind: "table", comparison: copy(comparison.comparison) }),
    ).toBeNull();
  });

  it("still reads pins stored before comparisons, unchanged", () => {
    const v1 = [
      { ...copy(spec), id: "a", pinnedBy: "player" },
      {
        title: "Units by month",
        kind: "table",
        query: { measure: "units", by: ["month"], filter: { genre: ["Memoir"] }, limit: 12 },
        id: "b",
        pinnedBy: "dewey",
      },
    ];
    expect(parsePins(JSON.stringify(v1))).toEqual(v1);
    const mixed = [...v1, { ...copy(comparison), id: "c", pinnedBy: "player" }];
    expect(parsePins(JSON.stringify(mixed))).toEqual(mixed);
  });

  it("keys a comparison on what it compares, whatever its title or filter order", () => {
    const filtered = (filter: object, title: string = comparison.title): PinSpec =>
      ({
        ...copy(comparison),
        title,
        comparison: { ...copy(comparison.comparison), filter },
      }) as PinSpec;
    expect(pinKey(filtered({ genre: ["Memoir", "Fiction"], format: ["Hardcover"] }))).toBe(
      pinKey(filtered({ format: ["Hardcover"], genre: ["Fiction", "Memoir"] }, "Q3 vs Q4 revenue")),
    );
    expect(pinKey(copy(comparison) as PinSpec)).not.toBe(
      pinKey({
        ...copy(comparison),
        comparison: { ...copy(comparison.comparison), from: "2193-Q2" },
      } as PinSpec),
    );
    let pins: Pin[] = addPin([], copy(comparison) as PinSpec, "dewey", "1");
    pins = addPin(pins, { ...copy(comparison), title: "Another title" } as PinSpec, "player", "2");
    expect(pins.map((p) => p.id)).toEqual(["2"]);
  });
});

describe("a pin with a saved segment (Goldy's defaults, req_7a658226468d)", () => {
  it("keeps the segment's id on a chart, a heatmap or a waterfall, and refuses a malformed one", () => {
    expect(parsePinSpec({ ...spec, segment: "seg-1" })).toEqual({ ...spec, segment: "seg-1" });
    const waterfall = {
      title: "What drove it",
      kind: "waterfall",
      waterfall: { by: "genre", then: "latest-1", now: "latest" },
      segment: "seg-1",
    };
    expect(parsePinSpec(waterfall)).toEqual(waterfall);
    for (const segment of ["", "Seg 1", 7, "x".repeat(41)])
      expect(parsePinSpec({ ...spec, segment })).toBeNull();
  });

  it("never carries one on a comparison, which is Dewey's", () => {
    const comparison = {
      title: "Fiction against Mystery",
      kind: "comparison",
      comparison: { measure: "revenue", across: "genre", from: "Fiction", to: "Mystery", by: [] },
    };
    expect(parsePinSpec(comparison)).not.toBeNull();
    expect(parsePinSpec({ ...comparison, segment: "seg-1" })).toBeNull();
  });

  it("is another pin from the same chart without it", () => {
    expect(pinKey(copy({ ...spec, segment: "seg-1" }) as PinSpec)).not.toBe(pinKey(spec));
    expect(pinKey(copy({ ...spec, segment: "seg-1" }) as PinSpec)).toBe(
      pinKey(copy({ ...spec, title: "Other", segment: "seg-1" }) as PinSpec),
    );
  });
});

describe("pins saved before months had a year", () => {
  it("read their month filters and month comparisons as 2193's, so they keep matching", () => {
    expect(
      parsePinSpec({
        title: "March",
        kind: "bar",
        query: { measure: "units", by: ["genre"], filter: { month: ["03", "2194-01"] } },
      }),
    ).toMatchObject({ query: { filter: { month: ["2193-03", "2194-01"] } } });
    expect(
      parsePinSpec({
        title: "Jan to Feb",
        kind: "comparison",
        comparison: { measure: "revenue", across: "month", from: "01", to: "02", by: [] },
      }),
    ).toMatchObject({ comparison: { from: "2193-01", to: "2193-02" } });
    expect(
      parsePinSpec({
        title: "Q3",
        kind: "comparison",
        comparison: {
          measure: "revenue",
          across: "quarter",
          from: "2193-Q3",
          to: "2193-Q4",
          by: [],
        },
      }),
    ).toMatchObject({ comparison: { from: "2193-Q3" } });
    expect(
      parsePins(
        JSON.stringify([
          {
            id: "p",
            pinnedBy: "player",
            title: "Old",
            kind: "bar",
            query: { measure: "units", by: ["weekday"], filter: { month: ["12"] } },
          },
        ]),
      )[0],
    ).toMatchObject({ query: { filter: { month: ["2193-12"] } } });
    // A restored Dewey lookup still holds "12": read first, it keys like the stored pin, so it shows as pinned (Sage).
    const old: PinSpec = {
      title: "Old",
      kind: "bar",
      query: { measure: "units", by: ["weekday"], filter: { month: ["12"] } },
    };
    const stored = parsePins(JSON.stringify([{ id: "p", pinnedBy: "dewey", ...old }]))[0]!;
    expect(pinKey(parsePinSpec(old)!)).toBe(pinKey(stored));
    expect(pinKey(old)).not.toBe(pinKey(stored));
  });
});

describe("a pin's chart or table view (David, 3 Nov 2026)", () => {
  const bar = {
    title: "Revenue by genre",
    kind: "bar" as const,
    query: { measure: "revenue" as const, by: ["genre" as const] },
  };
  const table = {
    title: "Revenue by month",
    kind: "table" as const,
    query: { measure: "revenue" as const, by: ["month" as const] },
  };

  it("keeps a toggled view on the pin, and refuses one that isn't a yes or no", () => {
    expect(parsePinSpec({ ...bar, table: true })).toEqual({ ...bar, table: true });
    expect(parsePinSpec({ ...table, table: false })).toEqual({ ...table, table: false });
    expect(parsePinSpec(bar)).toEqual(bar);
    expect(parsePinSpec({ ...bar, table: "yes" })).toBeNull();
  });

  it("shows a pin by its toggle, else its kind; and draws a table as the terminal would", () => {
    expect(shownAsTable(bar)).toBe(false);
    expect(shownAsTable({ ...bar, table: true })).toBe(true);
    expect(shownAsTable(table)).toBe(true);
    expect(shownAsTable({ ...table, table: false })).toBe(false);
    expect(drawnKind(table)).toBe("line");
    expect(drawnKind({ ...table, query: { ...table.query, by: ["genre"] } })).toBe("bar");
    expect(drawnKind({ ...bar, kind: "line" })).toBe("line");
  });

  it("says why there's no chart: a single figure, or a comparison", () => {
    expect(noChart(bar)).toBeNull();
    expect(noChart({ ...bar, query: { measure: "revenue", by: [] } })).toBe("figure");
    expect(
      noChart({
        title: "Q3 against Q4",
        kind: "comparison",
        comparison: {
          measure: "revenue",
          across: "quarter",
          from: "2193-Q3",
          to: "2193-Q4",
          by: [],
        },
      }),
    ).toBe("comparison");
  });

  it("matches the same pin whichever way it's shown", () => {
    expect(pinKey({ ...bar, table: true })).toBe(pinKey(bar));
  });
});

describe("a pin by what it shows (Sage, #302; Frank, #301)", () => {
  const query = { measure: "revenue" as const, by: ["genre" as const] };
  it("is one pin as a bar, a line or a table of one query, and another as a heatmap or with last year", () => {
    const bar = pinKey({ title: "A", kind: "bar", query });
    expect(pinKey({ title: "B", kind: "table", query })).toBe(bar);
    expect(pinKey({ title: "C", kind: "line", query })).toBe(bar);
    expect(
      pinKey({ title: "D", kind: "heatmap", query: { ...query, by: ["genre", "format"] } }),
    ).not.toBe(bar);
    expect(pinKey({ title: "E", kind: "bar", query: { ...query, vs: "last_year" } })).not.toBe(bar);
  });

  it("keeps last year on a pin's query, and refuses any other comparison", () => {
    const spec = {
      title: "Revenue by genre, vs. Q1 2193",
      kind: "bar",
      query: { ...query, filter: { quarter: ["2194-Q1"] }, vs: "last_year" },
    };
    expect(parsePinSpec(spec)).toEqual(spec);
    expect(parsePinSpec({ ...spec, query: { ...spec.query, vs: "last_quarter" } })).toBeNull();
  });
});

describe("a pinned waterfall (What drove the change)", () => {
  const waterfall = {
    title: "What drove revenue's change, Q4 2193 to Q1 2194, by genre",
    kind: "waterfall",
    waterfall: { by: "genre", then: "2193-Q4", now: "2194-Q1", filter: { format: ["Hardcover"] } },
  } as const;

  it("keeps its breakdown, its two quarters, the chart's other filters and its split", () => {
    expect(parsePinSpec(waterfall)).toEqual(waterfall);
    expect(
      parsePinSpec({
        ...waterfall,
        waterfall: { ...waterfall.waterfall, split: true },
        table: true,
      }),
    ).toEqual({
      ...waterfall,
      waterfall: { ...waterfall.waterfall, split: true },
      table: true,
    });
    expect(noChart(parsePinSpec(waterfall)!)).toBeNull();
  });

  it("made on Latest quarter, keeps relative quarters so it moves on, titled without a quarter (Plot, #379)", () => {
    const quarters = ["2193-Q1", "2193-Q2", "2193-Q3", "2193-Q4", "2194-Q1"];
    const latest = {
      ...DEFAULT_STATE,
      by: "genre" as const,
      drove: true,
      filters: { quarter: ["latest"], format: ["Hardcover"] },
    };
    const before = waterfallPinFor(latest, quarters)!;
    expect(before).toEqual({
      title: "What drove revenue's change into the latest quarter, by genre",
      kind: "waterfall",
      waterfall: {
        by: "genre",
        then: "latest-1",
        now: "latest",
        filter: { format: ["Hardcover"] },
      },
    });
    expect(parsePinSpec(before)).toEqual(before);
    const yearAgo = waterfallPinFor({ ...latest, lastYear: true }, quarters)!;
    expect(yearAgo.title).toBe(
      "What drove revenue's change from a year earlier to the latest quarter, by genre",
    );
    expect(yearAgo.waterfall).toMatchObject({ then: "latest-4", now: "latest" });
    expect(parsePinSpec(yearAgo)).toEqual(yearAgo);
    // A dated quarter keeps its dated pair and title.
    expect(waterfallPinFor({ ...latest, filters: { quarter: ["2194-Q1"] } }, quarters)?.title).toBe(
      "What drove revenue's change, Q4 2193 to Q1 2194, by genre",
    );
  });

  it("refuses one it couldn't draw", () => {
    const bad = (patch: object) =>
      parsePinSpec({ ...waterfall, waterfall: { ...waterfall.waterfall, ...patch } });
    expect(bad({ by: "month" })).toBeNull();
    expect(bad({ then: "2193-Q5" })).toBeNull();
    expect(bad({ now: "2193-Q4" })).toBeNull();
    // Backwards in time.
    expect(bad({ then: "2194-Q2" })).toBeNull();
    // Relative quarters only as latest against the quarter before or a year earlier, never mixed with dated ones.
    expect(bad({ then: "latest", now: "latest-1" })).toBeNull();
    expect(bad({ then: "latest-1", now: "2194-Q1" })).toBeNull();
    expect(bad({ then: "2193-Q4", now: "latest" })).toBeNull();
    expect(bad({ then: "latest-4", now: "latest" })).not.toBeNull();
    // The quarters are its own, and its breakdown isn't a filter.
    expect(bad({ filter: { quarter: ["2193-Q1"] } })).toBeNull();
    expect(bad({ filter: { genre: ["Fiction"] } })).toBeNull();
    expect(bad({ split: "yes" })).toBeNull();
    expect(parsePinSpec({ ...waterfall, extra: 1 })).toBeNull();
  });

  it("is one pin whether shown as its chart or its table, and another with the split", () => {
    const shown = parsePinSpec(waterfall)!;
    expect(pinKey({ ...shown, table: true } as PinSpec)).toBe(pinKey(shown));
    const split = parsePinSpec({
      ...waterfall,
      waterfall: { ...waterfall.waterfall, split: true },
    })!;
    expect(pinKey(split)).not.toBe(pinKey(shown));
  });
});

describe("pinning What drove the change", () => {
  it("pins the waterfall while it's on, with the chart's other filters, and nothing while it's off", () => {
    const quarters = ["2193-Q4", "2194-Q1"];
    const on = {
      ...DEFAULT_STATE,
      by: "genre" as const,
      drove: true,
      split: true,
      filters: { quarter: ["2194-Q1"], format: ["Hardcover"], genre: ["Fiction"] },
    };
    expect(waterfallPinFor(on, quarters)).toEqual({
      title: "What drove revenue's change, Q4 2193 to Q1 2194, by genre",
      kind: "waterfall",
      waterfall: {
        by: "genre",
        then: "2193-Q4",
        now: "2194-Q1",
        filter: { format: ["Hardcover"] },
        split: true,
      },
    });
    // It parses back as it was pinned.
    expect(parsePinSpec(waterfallPinFor(on, quarters))).toEqual(waterfallPinFor(on, quarters));
    expect(waterfallPinFor({ ...on, drove: false }, quarters)).toBeNull();
    expect(waterfallPinFor({ ...on, filters: {} }, quarters)).toBeNull();
  });
});

describe("a pin as shares (req_fa2e6a0dbbec)", () => {
  const spec = {
    title: "Revenue by genre, as shares",
    kind: "bar",
    query: { measure: "revenue", by: ["genre"] },
    share: "total",
  };

  it("keeps the mode, and is a different pin from the figures", () => {
    const parsed = parsePinSpec(spec);
    expect(parsed).toEqual(spec);
    expect(parsePinSpec({ ...spec, share: "running" })).toMatchObject({ share: "running" });
    const figures = { ...spec, share: undefined, title: "Revenue by genre" };
    expect(pinKey(parsed!)).not.toBe(pinKey(parsePinSpec(figures)!));
    expect(pinKey(parsed!)).not.toBe(pinKey(parsePinSpec({ ...spec, share: "running" })!));
  });

  it("drops a share mode the chart couldn't show", () => {
    expect(parsePinSpec({ ...spec, share: "everything" })).toBeNull();
    expect(parsePinSpec({ ...spec, query: { measure: "avg_discount", by: ["genre"] } })).toBeNull();
    expect(parsePinSpec({ ...spec, query: { measure: "revenue", by: [] } })).toBeNull();
    expect(parsePinSpec({ ...spec, kind: "heatmap" })).toBeNull();
    expect(parsePinSpec({ ...spec, also: ["units"] })).toBeNull();
  });
});

describe("a lookup of several measures, pinned from Dewey's chat (req_2d436ee864cd)", () => {
  const several = (also: string[], by: string[] = ["quarter"], kind = "line") => ({
    title: "Revenue and units sold by quarter",
    kind,
    query: { measure: "revenue", also, by },
  });

  it("keeps one Investigate's chart draws as its own pins are: the first measure, and also beside it", () => {
    expect(parsePinSpec(several(["units"]))).toEqual({
      title: "Revenue and units sold by quarter",
      kind: "line",
      query: { measure: "revenue", by: ["quarter"] },
      also: ["units"],
    });
    // The same pin, whichever way it came: so it's pinned once.
    expect(pinKey(parsePinSpec(several(["units"]))!)).toBe(
      pinKey(parsePinSpec({ ...spec, kind: "line", also: ["units"] })!),
    );
  });

  it("keeps any other as one query, shown as its table with the reason, in Plot's order", () => {
    const cases: [ReturnType<typeof several> | object, string][] = [
      [
        {
          ...several(["checkouts"]),
          query: { measure: "avg_rating", also: ["checkouts"], by: ["genre"] },
        },
        "books",
      ],
      [several(["units", "orders", "avg_discount"]), "measures"],
      [several(["units", "avg_discount"]), "axes"],
      [several(["units"], ["quarter", "genre"]), "breakdown"],
    ];
    for (const [value, why] of cases) {
      const pin = parsePinSpec(value)!;
      expect(pin, why).not.toBeNull();
      expect(
        pin.kind !== "comparison" && pin.kind !== "waterfall" && pin.query.also,
        why,
      ).toBeTruthy();
      expect(noChart(pin)).toBe(why);
    }
    // A figure for each measure: still one figure's reason.
    expect(noChart(parsePinSpec(several(["units"], []))!)).toBe("figure");
    // Another pin from the same query with its first measure only.
    const four = parsePinSpec(several(["units", "orders", "avg_discount"]))!;
    expect(pinKey(four)).not.toBe(pinKey(parsePinSpec({ ...spec, kind: "line" })!));
  });

  it("refuses measures the server would: too many, repeated, from different records, beside last year", () => {
    for (const query of [
      { measure: "revenue", also: [], by: ["quarter"] },
      { measure: "revenue", also: ["units", "orders", "avg_discount", "avg_order_value"], by: [] },
      { measure: "revenue", also: ["revenue"], by: [] },
      { measure: "revenue", also: ["avg_rating"], by: [] },
      { measure: "revenue", also: ["units"], by: ["genre"], vs: "last_year" },
      { measure: "revenue", also: "units", by: [] },
    ])
      expect(parsePinSpec({ title: "T", kind: "bar", query }), JSON.stringify(query)).toBeNull();
    // Never both ways at once, and never a heatmap or scatter plot.
    expect(parsePinSpec({ ...several(["units"]), also: ["orders"] })).toBeNull();
    expect(parsePinSpec(several(["units"], ["genre", "format"], "heatmap"))).toBeNull();
  });

  it("leaves every pin of one measure as it was", () => {
    expect(parsePinSpec(spec)).toEqual(spec);
    expect(noChart(parsePinSpec(spec)!)).toBeNull();
  });
});
