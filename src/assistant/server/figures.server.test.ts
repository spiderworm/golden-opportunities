import { describe, expect, it } from "vitest";
import { Refs, renderSentence, scrubDeep, sentenceGate, WITHHELD } from "./figures.server.ts";

const SOURCE = "Revenue from 56,350 visible matching sale lines; allowed periods: 2193-Q1, 2193-Q2, 2193-Q3, 2193-Q4; grouped by quarter.";
const byQuarter = ["query_data", { measure: "revenue", by: ["quarter"] }, { ref: "a", complete: true, columns: [], rows: [{ ref: "a1", quarter: "2193-Q1", revenue: 95245.8078 }, { ref: "a2", quarter: "2193-Q2", revenue: 164436.94 }, { ref: "a3", quarter: "2193-Q3", revenue: 274036.16 }, { ref: "a4", quarter: "2193-Q4", revenue: 161524.69 }], total: 695243.61, source: SOURCE }] as const;
const q2q4 = ["compare_data", { measure: "revenue", across: "quarter", from: "2193-Q2", to: "2193-Q4", by: [] }, { ref: "b", labels: { from: "2193-Q2", to: "2193-Q4" }, columns: [{ key: "from", label: "2193-Q2" }, { key: "to", label: "2193-Q4" }], rows: [], total: { from: 164436.94, to: 161524.69, change: -2912.25, percent_change: -1.7711, direction: "fell" }, source: "Compared. 2193-Q2: Sales 2193-Q4: Sales" }] as const;
const genres = ["compare_data", { measure: "orders", across: "quarter", from: "2193-Q3", to: "2193-Q4", by: ["genre"] }, { ref: "c", complete: true, labels: { from: "2193-Q3", to: "2193-Q4" }, columns: [{ key: "genre", label: "Genre" }, { key: "from", label: "2193-Q3" }, { key: "to", label: "2193-Q4" }], rows: [{ ref: "c1", genre: "Nonfiction", from: 278, to: 339, change: 61, percent_change: 21.94 }, { ref: "c2", genre: "SciFi/Fantasy", from: 7523, to: 4246, change: -3277, percent_change: -43.56 }, { ref: "c3", genre: "Memoir", from: 182, to: 74, change: -108, percent_change: -59.34 }], total: { from: 7983, to: 4659, change: -3324, percent_change: -41.64 }, source: SOURCE }] as const;
const refs = (...tools: (readonly [string, unknown, unknown])[]) => {
  const r = new Refs();
  for (const [name, input, output] of tools) r.addTool(name, input, output);
  return r;
};
const all = refs(byQuarter, q2q4, genres);
const say = (sentence: string, r = all) => renderSentence(sentence, r)?.text ?? WITHHELD;

describe("refs render the data's own figures, units and directions", () => {
  it("query values, totals, row counts and labels", () => {
    expect(say("Revenue in {{a4.quarter}} was {{a4}}, of {{a.total}} over {{a.rows}} quarters.")).toBe("Revenue in 2193-Q4 was $161,524.69, of $695,243.61 over 4 quarters.");
    expect(say("{{a.max}}. {{a.min}}.")).toBe("2193-Q3 had the highest revenue, $274,036.16. 2193-Q1 had the lowest revenue, $95,245.81.");
  });

  it("changes and percents carry the data's direction", () => {
    expect(say("Revenue {{b.change}} from 2193-Q2 to 2193-Q4, {{b.percent}}.")).toBe("Revenue fell by $2,912.25 from 2193-Q2 to 2193-Q4, a fall of 1.8%.");
    expect(say("For Nonfiction, orders {{c1.change}}, {{c1.percent}}.")).toBe("For Nonfiction, orders rose by 61, a rise of 21.9%.");
  });

  it("comparisons follow either order, so the question's order can be kept (Probe G1)", () => {
    expect(say("{{b.from_vs_to}}.")).toBe("2193-Q2's revenue was $2,912.25 higher than 2193-Q4's.");
    expect(say("{{b.to_vs_from}}.")).toBe("2193-Q4's revenue was $2,912.25 lower than 2193-Q2's.");
    expect(say("{{c2.to_vs_from}}.")).toBe("For SciFi/Fantasy, 2193-Q4 had 3,277 fewer orders than 2193-Q3.");
  });

  it("the row that moved most, either way", () => {
    expect(say("{{c.largest_fall}}, and {{c.largest_rise}}.")).toBe("SciFi/Fantasy fell the most, by 3,277, and Nonfiction rose the most, by 61.");
    expect(say("{{c.largest_fall_percent}}.")).toBe("Memoir fell the most in percent, a fall of 59.3%.");
  });

  it("ranks only over complete results: a limited or capped lookup's max is no global claim (Audit)", () => {
    const limited = refs(["query_data", { measure: "units", by: ["genre"], sort: { column: "units", direction: "asc" }, limit: 1 }, { ref: "f", complete: false, columns: [], rows: [{ ref: "f1", genre: "Memoir", units: 74 }], total: 56350, source: "" }]);
    expect(say("{{f.max}}.", limited)).toBe(WITHHELD);
    expect(say("{{f1.genre}} sold {{f1}}.", limited)).toBe("Memoir sold 74.");
    const capped = refs(["compare_data", { measure: "units", across: "quarter", from: "2193-Q3", to: "2193-Q4", by: ["title"] }, { ref: "g", complete: false, columns: [], rows: [{ ref: "g1", title: "T", from: 5, to: 1, change: -4, percent_change: -80 }], total: { from: 5, to: 1, change: -4, percent_change: -80 }, source: "" }]);
    expect(say("{{g.largest_fall}}.", capped)).toBe(WITHHELD);
    expect(say("{{g.largest_fall_percent}}.", capped)).toBe(WITHHELD);
  });

  it("rounds only when asked, to a power of ten (Probe G3)", () => {
    expect(say("Revenue in 2193-Q2 was {{a2|round:10000}}.")).toBe("Revenue in 2193-Q2 was about $160,000.");
    expect(say("It was {{a2|round:7}}.")).toBe(WITHHELD);
    expect(say("It was {{b.percent|round:10}}.")).toBe(WITHHELD);
  });

  it("fails closed on unknown, malformed and too-long refs, and on refs to nothing", () => {
    for (const s of ["It was {{z1}}.", "It was {{a9}}.", "It was {{a4.cost}}.", "It was {{ a4 }.", "It was {{a4}", "It was {{a4.total}}.", `It was {{${"a".repeat(41)}}}.`]) expect(say(s), s).toBe(WITHHELD);
    expect(say("It was {{ a4 }}.")).toBe("It was $161,524.69.");
  });

  it("a filter value is a label only when it alone was asked for and the data had something (Audit's OR filter)", () => {
    const filtered = (filter: Record<string, string[]>, total: number) => refs(["query_data", { measure: "units", by: ["month"], filter }, { ref: "e", columns: [], rows: [{ ref: "e1", month: "01", units: total }], total, source: "" }]);
    expect(say("At the {{e.discount_rate}} rate, in {{e1.month}}, {{e1.discount_rate}}.", filtered({ discount_rate: ["15%"] }, 658))).toBe("At the 15% rate, in 01, 15%.");
    expect(say("At {{e.title}}.", filtered({ title: ["Real Title", "63843"] }, 658))).toBe(WITHHELD);
    expect(say("At {{e.title}}.", filtered({ title: ["63843"] }, 0))).toBe(WITHHELD);
  });

  it("accepts a total written out ({{b.total.change}})", () => {
    expect(say("Revenue {{b.total.change}}; {{b.total.to_vs_from}}.")).toBe("Revenue fell by $2,912.25; 2193-Q4's revenue was $2,912.25 lower than 2193-Q2's.");
  });

  it("seeds period names only from returned rows and confirmed filters, never from captions (Audit)", () => {
    const captions = refs(["compare_data", { measure: "units", across: "quarter", from: "2194-Q1", to: "2194-Q2" }, { ref: "h", complete: true, labels: { from: null, to: null }, columns: [{ key: "from", label: "2194-Q1" }, { key: "to", label: "2194-Q2" }], rows: [], total: { from: 0, to: 0, change: 0, percent_change: null }, source: "units compared across quarter, 2194-Q1 against 2194-Q2; allowed periods: 2194-Q1" }]);
    expect(say("In 2194-Q1, nothing.", captions)).toBe(WITHHELD);
    expect(say("{{h.from_vs_to}}.", captions)).toBe(WITHHELD);
    const filtered = refs(["query_data", { measure: "units", by: [], filter: { quarter: ["2193-Q2"] } }, { ref: "i", complete: true, columns: [], rows: [{ ref: "i1", units: 13354 }], total: 13354, source: "allowed periods: 2193-Q1, 2193-Q2, 2193-Q3, 2193-Q4" }]);
    expect(say("Units in 2193-Q2 came to {{i.total}}.", filtered)).toBe("Units in 2193-Q2 came to 13,354.");
    expect(say("Units in 2193-Q3, too.", filtered)).toBe(WITHHELD);
  });

  it("a compared value is a label only where the data had something there", () => {
    const empty = refs(["compare_data", { measure: "units", across: "quarter", from: "2193-Q4", to: "63843" }, { ref: "d", columns: [{ key: "from", label: "2193-Q4" }, { key: "to", label: "63843" }], rows: [], total: { from: 13093, to: 0, change: -13093, percent_change: -100 }, source: "" }]);
    expect(say("{{d.from_vs_to}}.", empty)).toBe(WITHHELD);
  });
});

describe("the model's own prose: no figures, no directions (every bypass so far)", () => {
  it.each([
    // Audit, first review of #32
    ["a figure only a failed lookup's input held", "Gross profit was $63,843."],
    ["a reversed sign", "Change was +59.8%."],
    ["a negative currency", "Revenue was -$123.45."],
    ["a small figure", "Revenue was $7."],
    // Probe's static test
    ["number words", "About sixty-three thousand."],
    ["K and M suffixes", "Revenue was $113K."],
    ["a multiplier", "Q3 sold 1.7x as many."],
    ["a fraction", "Two-thirds of them were Fiction."],
    ["a bare year standing in for a figure", "That's 2,193 units."],
    ["the player's own figure", "You said 60% of list."],
    // Audit, re-review at 65857c7
    ["small number words with units", "It cost seven dollars."],
    ["a count in words", "Ten units sold."],
    ["a sign inside the currency", "Revenue was $-63843."],
    ["a year with a unit", "It came to 2193 dollars."],
    ["an echoed filter value", "Gross profit was 63843."],
    ["contradictory directions", "Revenue fell then rose by a little."],
    // Probe G1: a false direction with no figure at all
    ["a comparison of its own", "It didn't run higher than Q4."],
    ["a ranking of its own", "SciFi/Fantasy fell the most."],
    ["a count claim (B2)", "Each month has one title."],
    ["a bare year", "The terminal only holds 2193."],
    ["a period no lookup returned", "There is no 2192-Q4 to compare."],
    ["stray braces", "It was {{a4} or so."],
  ])("withholds %s", (_, sentence) => {
    expect(say(sentence)).toBe(WITHHELD);
  });

  it.each([
    // Audit, review of a82bb9b
    ["'one' counting", "There's one of each title."],
    ["a comparison after an allowed phrase", "I can show more revenue than that."],
    ["a fraction with 'quarter'", "A quarter of the orders were Fiction."],
    ["'shrank'", "Fiction shrank."],
    ["full-width digits", "Revenue was ７."],
    // Probe, re-check of a82bb9b (X2)
    ["full-width digits with a comma", "Revenue was １６１,５２５."],
    ["Arabic-Indic digits", "Revenue was ١٦١٥٢٥."],
    ["a vulgar fraction", "About ¾ of them."],
    ["'-fold'", "A threefold change, or two-fold."],
    ["'a couple'", "A couple of titles."],
    ...["outpaced", "lagged", "overtook", "surpassed", "sank", "soared", "better", "worse", "peaked", "bottomed", "slipped", "jumped", "surged", "dipped", "climbed", "tumbled", "plunged", "edged"].map((w) => [`'${w}'`, `Fiction ${w} there.`]),
    // Probe X3: "Yes" or "No" is a claim unless the rest is refs
    ["a bare 'No' with a claim", "No, it was not."],
    ["a bare 'Yes'", "Yes."],
  ])("also withholds %s", (_, sentence) => {
    expect(say(sentence)).toBe(WITHHELD);
  });

  it("allows period names from the lookups, a yes or no over refs, and a few exact phrases", () => {
    for (const s of [
      "I looked up revenue by quarter, broken down by genre, for 2193-Q1 through 2193-Q4.",
      "No, {{b.to_vs_from}}.",
      "Yes, {{b.from_vs_to}}.",
      "I can look it up again in more detail.",
      "I'm looking it up.",
      "I can't tell you why; that part's yours. I can show revenue, units, orders or average order value, by month or quarter, broken down by genre, format, publisher, weekday, discount or title.",
    ]) expect(say(s), s).not.toBe(WITHHELD);
    expect(say("Q4 is a quarter.", new Refs())).toBe(WITHHELD);
    expect(say("No, {{b.to_vs_from}}.")).toBe("No, 2193-Q4's revenue was $2,912.25 lower than 2193-Q2's.");
  });
});

describe("the sentence gate", () => {
  it("renders sentences whole and shows at most one note per reply (Probe X3)", () => {
    const gate = sentenceGate(all);
    expect(gate.push("Revenue in 2193-Q4 was {{a")).toBe("");
    expect(gate.push("4}}. Gross profit was $63,843. Cost was higher.\n\nThe table")).toBe(`Revenue in 2193-Q4 was $161,524.69. ${WITHHELD}\n\n`);
    expect(gate.push(" is under this message. It fell. The rest is ours.")).toBe("The table is under this message. ");
    expect(gate.flush()).toBe("The rest is ours.");
    expect([gate.withheld, gate.rendered]).toEqual([3, 1]);
  });

  it("withholds a unit split from its value across a line break (Audit)", () => {
    const gate = sentenceGate(all);
    expect(gate.push("Revenue was $\n")).toBe(`${WITHHELD}\n`);
    // The second piece is withheld too, without a second note.
    expect(gate.push("7. ")).toBe("");
  });

  it("binds refs and period names to the lookups back when the text arrived, not when it's shown (Audit)", () => {
    const later = new Refs();
    const gate = sentenceGate(later);
    // Still buffered (no sentence end yet) when the lookup registers: it was written before it, so withheld.
    expect(gate.push("In 2193-Q4 it was {{a4}}")).toBe("");
    later.addTool(...byQuarter);
    expect(gate.push(". ")).toBe(`${WITHHELD} `);
    expect(gate.push("It was {{a4}}. ")).toBe("It was $161,524.69. ");
    expect(renderSentence("In 2193-Q4.", later, 0)).toBeNull();
    expect(renderSentence("In 2193-Q4.", later, 1)).not.toBeNull();
  });
});

it("scrubDeep hides a secret in every string, keys included", () => {
  expect(scrubDeep({ type: "pin", chart: { title: "code abc123" }, list: ["abc123"], abc123: 1 }, "abc123")).toEqual({ type: "pin", chart: { title: "code [hidden]" }, list: ["[hidden]"], "[hidden]": 1 });
});

describe("months name their year, so like quarters they are period names", () => {
  const byMonth = ["query_data", { measure: "units", by: ["month"], filter: { quarter: ["2194-Q1"] } }, { ref: "m", complete: true, columns: [], rows: [{ ref: "m1", month: "2194-01", units: 2597 }, { ref: "m2", month: "2194-02", units: 2364 }], total: 4961, source: SOURCE }] as const;
  it("a month a lookup returned may be named in prose; one it didn't is withheld", () => {
    const r = refs(byMonth);
    expect(say("In 2194-01, units were {{m1}}.", r)).toBe("In 2194-01, units were 2,597.");
    expect(say("In 2193-01, units were {{m1}}.", r)).toBe(WITHHELD);
  });

  it("after a lookup by month, its months name the range, not quarters it didn't return (q2-digit-title)", () => {
    const year = ["query_data", { measure: "units", by: ["month"] }, { ref: "y", complete: true, columns: [], rows: [{ ref: "y1", month: "2193-01", units: 210 }, { ref: "y2", month: "2193-12", units: 330 }], total: 540, source: SOURCE }] as const;
    const r = refs(year);
    expect(say("I looked up units by month, from {{y1.month}} to {{y2.month}}.", r)).toBe("I looked up units by month, from 2193-01 to 2193-12.");
    expect(say("I looked up units by month, from 2193-Q1 to 2193-Q4.", r)).toBe(WITHHELD);
  });
});
