// Several measures in one lookup (David, 12 Nov 2026): each figure names its measure, renders in that measure's
// unit, and a ref that names none resolves to nothing (engine-notes.md, "Several measures in one lookup").
import { describe, expect, it } from "vitest";
import { Refs, renderSentence, WITHHELD } from "./figures.server.ts";

const SOURCE = "Sales from visible matching sale lines; grouped by quarter.";
// As the tool server gives it (withMeasuresEvidence): a column per measure, totals by measure, and each average's
// evidence named by its measure.
const sales = [
  "query_data",
  { measure: "revenue", also: ["units", "avg_order_value"], by: ["quarter"] },
  {
    ref: "a",
    complete: true,
    columns: [],
    rows: [
      {
        ref: "a1",
        quarter: "2193-Q1",
        revenue: 95245.81,
        units: 6012,
        avg_order_value: 31.5,
        avg_order_value_n: 3024,
      },
      {
        ref: "a2",
        quarter: "2193-Q2",
        revenue: 164436.94,
        units: 13354,
        avg_order_value: 29.25,
        avg_order_value_n: 5622,
      },
    ],
    totals: { revenue: 259682.75, units: 19366, avg_order_value: 30.01 },
    evidence_units: { avg_order_value: "orders" },
    avg_order_value_n: 8646,
    source: SOURCE,
  },
] as const;
const books = [
  "query_data",
  { measure: "avg_rating", also: ["checkouts"], by: ["genre"] },
  {
    ref: "b",
    complete: true,
    columns: [],
    rows: [
      {
        ref: "b1",
        genre: "Mystery",
        avg_rating: 4.12,
        checkouts: 310,
        avg_rating_n: 212,
        avg_rating_range_low: 3.94,
        avg_rating_range_high: 4.3,
      },
      {
        ref: "b2",
        genre: "Poetry",
        avg_rating: 5,
        checkouts: 40,
        avg_rating_n: 3,
        avg_rating_range_none: "agree",
      },
    ],
    totals: { avg_rating: 4.2, checkouts: 350 },
    evidence_units: { avg_rating: "ratings" },
    avg_rating_n: 215,
    avg_rating_range_low: 4.0,
    avg_rating_range_high: 4.4,
    source: SOURCE,
  },
] as const;
const refs = (...tools: (readonly [string, unknown, unknown])[]) => {
  const r = new Refs();
  for (const [name, input, output] of tools) r.addTool(name, input, output);
  return r;
};
const all = refs(sales, books);
const say = (sentence: string, r = all) => renderSentence(sentence, r)?.text ?? WITHHELD;

describe("a lookup of several measures", () => {
  it("renders each figure by its measure's name, in that measure's unit", () => {
    expect(
      say(
        "In {{a2.quarter}}, revenue was {{a2.revenue}}, units {{a2.units}}, and the average order {{a2.avg_order_value}}.",
      ),
    ).toBe("In 2193-Q2, revenue was $164,436.94, units 13,354, and the average order $29.25.");
    expect(say("Revenue came to {{a.revenue}}, and units to {{a.total.units}}.")).toBe(
      "Revenue came to $259,682.75, and units to 19,366.",
    );
    expect(say("{{b1.genre}} had {{b1.checkouts}} checkouts.")).toBe("Mystery had 310 checkouts.");
    expect(say("About {{a.units|round:1000}}.")).toBe("About about 19,000.");
  });

  it("refuses a ref that names no measure: it never picks one (Goldy's brief)", () => {
    for (const ref of ["a2", "a.total", "a.max", "a.min", "a2.n", "a.n", "b1.range", "b.range"])
      expect(say(`It was {{${ref}}}.`), ref).toBe(WITHHELD);
  });

  it("refuses a measure the lookup didn't ask for (Probe's #252, per measure)", () => {
    for (const ref of ["a2.orders", "a.orders", "b1.revenue", "a.orders.max", "a2.avg_rating.n"])
      expect(say(`It was {{${ref}}}.`), ref).toBe(WITHHELD);
  });

  it("ranks each measure in its own words, only over complete results", () => {
    expect(say("{{a.units.max}}. {{a.revenue.min}}.")).toBe(
      "2193-Q2 had the most units, 13,354. 2193-Q1 had the lowest revenue, $95,245.81.",
    );
    const capped = refs([
      sales[0],
      sales[1],
      { ...sales[2], complete: false },
    ] as unknown as readonly [string, unknown, unknown]);
    expect(say("{{a.units.max}}.", capped)).toBe(WITHHELD);
  });

  it("gives each average's evidence by its measure, with its own unit", () => {
    expect(
      say(
        "{{a2.quarter}}'s average order value was {{a2.avg_order_value}}, based on {{a2.avg_order_value.n}}.",
      ),
    ).toBe("2193-Q2's average order value was $29.25, based on 5,622 orders.");
    expect(say("The average was {{a.avg_order_value}}, based on {{a.avg_order_value.n}}.")).toBe(
      "The average was $30.01, based on 8,646 orders.",
    );
    expect(
      say(
        "{{b1.genre}}'s average rating is {{b1.avg_rating}}, based on {{b1.avg_rating.n}}, with {{b1.avg_rating.range}}.",
      ),
    ).toBe(
      "Mystery's average rating is 4.12, based on 212 ratings, with a likely range of 3.9 to 4.3 stars.",
    );
    expect(say("{{b2.genre}}'s is {{b2.avg_rating}}, with {{b2.avg_rating.range}}.")).toBe(
      "Poetry's is 5, with no likely range, since all 3 ratings are 5 stars.",
    );
    // A sum has no n, as in a lookup of one measure.
    expect(say("{{a2.quarter}} had {{a2.revenue}}, based on {{a2.revenue.n}}.")).toBe(WITHHELD);
  });

  it("never lends one measure's evidence to another's figure", () => {
    expect(say("{{a2.quarter}} had {{a2.revenue}}, based on {{a2.avg_order_value.n}}.")).toBe(
      WITHHELD,
    );
    expect(say("{{b1.genre}} had {{b1.checkouts}} checkouts, with {{b1.avg_rating.range}}.")).toBe(
      WITHHELD,
    );
    // Evidence alone, or beside another row, is withheld as before.
    expect(say("That is {{b1.avg_rating.n}}.")).toBe(WITHHELD);
    expect(say("{{b2.avg_rating}}, based on {{b1.avg_rating.n}}.")).toBe(WITHHELD);
  });

  it("ignores a unit that isn't the measure's own average's", () => {
    const spoofed = refs([
      sales[0],
      sales[1],
      { ...sales[2], evidence_units: { avg_order_value: "ratings", revenue: "orders" } },
    ] as unknown as readonly [string, unknown, unknown]);
    expect(say("{{a2.avg_order_value}}, based on {{a2.avg_order_value.n}}.", spoofed)).toBe(
      WITHHELD,
    );
  });

  it("keeps the price checks per measure: a dollar figure is revenue's, never units'", () => {
    expect(say("Shoppers paid {{a2.revenue}} in {{a2.quarter}}.")).toBe(WITHHELD);
    expect(say("Shoppers paid for {{a2.units}} books in {{a2.quarter}}.")).toBe(
      "Shoppers paid for 13,354 books in 2193-Q2.",
    );
    expect(say("Each quarter stayed under {{a.units.max}}.")).toBe(WITHHELD);
  });

  it("takes only a well-formed lookup: known, distinct measures, at most four, each with its total", () => {
    const bad = [
      { ...sales[1], also: ["revenue"] },
      { ...sales[1], also: ["units", "pages"] },
      { ...sales[1], also: "units" },
      { ...sales[1], also: ["units", "orders", "avg_discount", "avg_order_value"] },
    ];
    for (const input of bad)
      expect(say("It was {{a.revenue}}.", refs(["query_data", input, sales[2]]))).toBe(WITHHELD);
    const { totals: _, ...noTotals } = sales[2];
    expect(say("It was {{a.revenue}}.", refs(["query_data", sales[1], noTotals]))).toBe(WITHHELD);
    expect(
      say(
        "It was {{a.revenue}}.",
        refs(["compare_data", { ...sales[1], across: "quarter", from: "x", to: "y" }, sales[2]]),
      ),
    ).toBe(WITHHELD);
  });

  it("confirms a one-value filter when any of its measures found something", () => {
    const filtered = refs([
      "query_data",
      { measure: "revenue", also: ["units"], by: [], filter: { genre: ["Poetry"] } },
      {
        ref: "a",
        complete: true,
        columns: [],
        rows: [],
        totals: { revenue: 0, units: 3 },
        source: SOURCE,
      },
    ]);
    expect(say("{{a.genre}} sold {{a.units}} units.", filtered)).toBe("Poetry sold 3 units.");
  });
});

describe("a lookup of one measure, unchanged", () => {
  const one = refs([
    "query_data",
    { measure: "units", by: ["quarter"] },
    {
      ref: "a",
      complete: true,
      columns: [],
      rows: [
        { ref: "a1", quarter: "2193-Q1", units: 6012 },
        { ref: "a2", quarter: "2193-Q2", units: 13354 },
      ],
      total: 19366,
      source: SOURCE,
    },
  ]);
  it("keeps its bare refs, and takes the named forms too", () => {
    expect(say("{{a2}}, of {{a.total}}. {{a.max}}.", one)).toBe(
      "13,354, of 19,366. 2193-Q2 had the most units, 13,354.",
    );
    expect(say("{{a2.units}}, of {{a.units}}. {{a.units.min}}.", one)).toBe(
      "13,354, of 19,366. 2193-Q1 had the fewest units, 6,012.",
    );
    expect(say("It was {{a.revenue}}.", one)).toBe(WITHHELD);
  });
});
