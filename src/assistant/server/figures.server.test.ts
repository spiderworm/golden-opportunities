import { describe, expect, it } from "vitest";
import { hasBannedWord, Refs, renderSentence, scrubDeep, sentenceGate, WITHHELD } from "./figures.server.ts";

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
    ["a multiplier (Audit's review of #170)", "Memoir sales quadrupled."],
    ["'trebled'", "Orders trebled."],
    ["a Roman numeral", "Volume XX sold well."],
    ["a folded Roman numeral", "Volume \u216B sold well."],
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

describe("titles the data returned may be named in prose, digits and all (Probe's Q2 red-team)", () => {
  const TITLE = "9803 North Millworks Road";
  const byTitle = ["query_data", { measure: "units", by: ["title"] }, { ref: "t", complete: true, columns: [], rows: [{ ref: "t1", title: TITLE, units: 1212 }, { ref: "t2", title: "1984", units: 7 }, { ref: "t3", title: "The Seawitch Sings", units: 900 }], total: 2119, source: SOURCE }] as const;
  const filteredTo = (title: string, total: number) => ["query_data", { measure: "units", by: ["month"], filter: { title: [title] } }, { ref: "f", complete: true, columns: [], rows: [], total, source: SOURCE }] as const;

  it("a title from the rows, exactly and whole", () => {
    const r = refs(byTitle);
    expect(say(`I looked up units for ${TITLE}: {{t1}}.`, r)).toBe(`I looked up units for ${TITLE}: 1,212.`);
  });

  it("a title the player asked for, once the data confirmed it with something there", () => {
    expect(say(`I looked up units by month for ${TITLE}. They came to {{f.total}}.`, refs(filteredTo(TITLE, 3204)))).toBe(`I looked up units by month for ${TITLE}. They came to 3,204.`);
    // Nothing there: the filter value is only the model's, so its digits are its own.
    expect(say(`I looked up units by month for ${TITLE}.`, refs(filteredTo(TITLE, 0)))).toBe(WITHHELD);
  });

  it("never a made-up title, part of one, a figure beside one, or one no lookup had returned yet", () => {
    const r = refs(byTitle);
    expect(say("I looked up units for The 500 Club: {{t1}}.", r)).toBe(WITHHELD);
    expect(say("I looked up units for 9803 North: {{t1}}.", r)).toBe(WITHHELD);
    expect(say(`I looked up units for ${TITLE}. It sold 212.`, r)).toBe(WITHHELD);
    expect(say(`${TITLE} sold 212 copies.`, r)).toBe(WITHHELD);
    expect(say(`I looked up units for ${TITLE}2: {{t1}}.`, r)).toBe(WITHHELD);
    expect(renderSentence(`I looked up units for ${TITLE}.`, r, 0)).toBeNull();
  });

  it("a title made of number or direction words passes whole, and only whole (Probe's review of #152)", () => {
    const r = refs(["query_data", { measure: "units", by: ["title"] }, { ref: "w", complete: true, columns: [], rows: [{ ref: "w1", title: "Zero over Twelve", units: 41 }, { ref: "w2", title: "No More Lightning", units: 9 }], total: 50, source: SOURCE }]);
    expect(say("I looked up units for Zero over Twelve: {{w1}}.", r)).toBe("I looked up units for Zero over Twelve: 41.");
    expect(say("No More Lightning sold {{w2}}.", r)).toBe("No More Lightning sold 9.");
    expect(say("Zero over Twelve sold twelve.", r)).toBe(WITHHELD);
    expect(say("No more than {{w2}}.", r)).toBe(WITHHELD);
  });

  it("not a title that's only a number: it could pass for a figure", () => {
    expect(say("I looked up units for 1984: {{t2}}.", refs(byTitle))).toBe(WITHHELD);
  });

  it("only titles: other dimensions' values with digits stay the model's (a 15% discount rate)", () => {
    const rates = ["query_data", { measure: "units", by: ["discount_rate"] }, { ref: "d", complete: true, columns: [], rows: [{ ref: "d1", discount_rate: "15%", units: 30 }], total: 30, source: SOURCE }] as const;
    expect(say("At 15%, units were {{d1}}.", refs(rates))).toBe(WITHHELD);
  });
});

describe("invisible characters (Probe)", () => {
  it("are dropped before the checks, so a word split by one is still caught", () => {
    for (const hidden of ["\u00AD", "\u200B", "\u2060", "\uFEFF", "\u200D"]) {
      expect(say(`Fi${hidden}ve units sold.`), JSON.stringify(hidden)).toBe(WITHHELD);
      expect(say(`Revenue was hig${hidden}her in {{a4.quarter}}.`), JSON.stringify(hidden)).toBe(WITHHELD);
    }
  });

  it("and from what's shown", () => {
    expect(say("Reve\u00ADnue in {{a4.quarter}} was {{a4}}.")).toBe("Revenue in 2193-Q4 was $161,524.69.");
  });
});

describe("prices (Probe's #225)", () => {
  // Lookups as #179's dimensions return them: by edition with its list price and band, a confirmed price filter,
  // and an average order value.
  const editions = ["query_data", { measure: "revenue", by: ["edition", "list_price", "price_band"] }, { ref: "a", complete: true, columns: [], rows: [
    { ref: "a1", edition: "Post Alley (Hardcover)", list_price: "$27.99", price_band: "$20 to $29.99", revenue: 1427.49 },
    { ref: "a2", edition: "Post Alley (Trade paperback)", list_price: "$17.99", price_band: "$10 to $19.99", revenue: 611.66 },
    { ref: "a3", edition: "Heliotrope Pajamas (Paperback, 2181)", list_price: "$7.99", price_band: "under $10", revenue: 95.88 },
  ], total: 2135.03, source: SOURCE }] as const;
  const atPrice = ["query_data", { measure: "units", by: [], filter: { list_price: ["$27.99"] } }, { ref: "b", complete: true, columns: [], rows: [], total: 51, source: SOURCE }] as const;
  const aov = ["query_data", { measure: "avg_order_value", by: [] }, { ref: "c", complete: true, columns: [], rows: [], total: 31.2, source: SOURCE }] as const;
  const r = refs(editions, atPrice, aov);

  it("show a price with its own edition, named by ref or by its exact label", () => {
    expect(say("{{a1.edition}} lists at {{a1.list_price}}, in the {{a1.price_band}} band.", r)).toBe("Post Alley (Hardcover) lists at $27.99, in the $20 to $29.99 band.");
    expect(say("Post Alley (Hardcover) lists at {{a1.list_price}}.", r)).toBe("Post Alley (Hardcover) lists at $27.99.");
    expect(say("{{a2.edition}}, the trade paperback, lists at {{a2.list_price}}.", r)).toBe("Post Alley (Trade paperback), the trade paperback, lists at $17.99.");
  });

  it("never let a price attach to another book, or to none", () => {
    expect(say("{{a2.edition}} costs {{a1.list_price}}.", r)).toBe(WITHHELD);
    expect(say("Post Alley (Trade paperback) costs {{a1.list_price}}.", r)).toBe(WITHHELD);
    expect(say("It lists at {{a1.list_price}}.", r)).toBe(WITHHELD);
    // Its own edition and another's: withheld, not shown (Goldy).
    expect(say("{{a1.edition}} lists at {{a1.list_price}}, like {{a2.edition}}.", r)).toBe(WITHHELD);
  });

  it("match a format word whole against the edition's own format (Audit)", () => {
    // a2 is the trade paperback: a bare "paperback" could be three formats.
    expect(say("{{a2.edition}}, the paperback, costs {{a2.list_price}}.", r)).toBe(WITHHELD);
    expect(say("{{a1.edition}}, the paperback, costs {{a1.list_price}}.", r)).toBe(WITHHELD);
    expect(say("{{a1.edition}}, the hardcover, costs {{a1.list_price}}.", r)).toBe("Post Alley (Hardcover), the hardcover, costs $27.99.");
  });

  it("hold a price grouped by format to its own format, named in prose or by ref (Audit's review)", () => {
    const byFormat = ["query_data", { measure: "units", by: ["format", "list_price"] }, { ref: "f", complete: true, columns: [], rows: [
      { ref: "f1", format: "Hardcover", list_price: "$27.99", units: 51 },
      { ref: "f2", format: "Trade paperback", list_price: "$17.99", units: 34 },
    ], total: 85, source: SOURCE }] as const;
    const f = refs(byFormat);
    expect(say("Hardcovers at {{f2.list_price}} sold {{f2}} copies.", f)).toBe(WITHHELD);
    expect(say("The trade paperback lists at {{f1.list_price}}.", f)).toBe(WITHHELD);
    expect(say("{{f1.format}} lists at {{f2.list_price}}.", f)).toBe(WITHHELD);
    expect(say("{{f2.format}} copies at {{f2.list_price}} sold {{f2}}.", f)).toBe("Trade paperback copies at $17.99 sold 34.");
    expect(say("Trade paperbacks at {{f2.list_price}} sold {{f2}}.", f)).toBe("Trade paperbacks at $17.99 sold 34.");
    // A price group with no format can't be given one.
    expect(say("Hardcovers in {{b.list_price}} sold {{b.total}} units.", r)).toBe(WITHHELD);
  });

  it("never carry a book's price over to another (Probe's review of #228)", () => {
    for (const tail of [", and Heliotrope Pajamas does too.", ", as does The Lantern Hours.", ", as do the other editions.", ", the same as Heliotrope Pajamas.", ", like every hardcover.", ", and so is the paperback."]) {
      expect(say(`{{a1.edition}} costs {{a1.list_price}}${tail}`, r), tail).toBe(WITHHELD);
    }
    // The title inside an edition label is a book named: its own is fine, another's isn't.
    expect(say("Post Alley's {{a1.edition}} lists at {{a1.list_price}}.", r)).toBe("Post Alley's Post Alley (Hardcover) lists at $27.99.");
    expect(say("{{a1.edition}} lists at {{a1.list_price}}, unlike Heliotrope Pajamas.", r)).toBe(WITHHELD);
  });

  it("read format synonyms: hardback is a hardcover; softcover fits no one format (Probe's review of #228)", () => {
    expect(say("{{a1.edition}}, the hardback, costs {{a1.list_price}}.", r)).toBe("Post Alley (Hardcover), the hardback, costs $27.99.");
    expect(say("{{a1.edition}}, the softcover, costs {{a1.list_price}}.", r)).toBe(WITHHELD);
    expect(say("{{a2.edition}}, the softcover, costs {{a2.list_price}}.", r)).toBe(WITHHELD);
    expect(say("{{a2.edition}}, the hard cover, costs {{a2.list_price}}.", r)).toBe(WITHHELD);
  });

  it("stop a book's price carrying into the next sentence (Probe's review of #228)", () => {
    const gate = () => sentenceGate(r);
    let g = gate();
    expect(g.push("{{a1.edition}} lists at {{a1.list_price}}. The Lantern Hours does too. ") + g.flush()).toBe(`Post Alley (Hardcover) lists at $27.99. ${WITHHELD} `);
    g = gate();
    expect(g.push("{{a1.edition}} lists at {{a1.list_price}}. {{a3.edition}} sold well. ") + g.flush()).toBe(`Post Alley (Hardcover) lists at $27.99. ${WITHHELD} `);
    // Its own book, or a sentence with its own price, carries on; and only the next sentence is held to it.
    g = gate();
    expect(g.push("{{a1.edition}} lists at {{a1.list_price}}. {{a1.edition}} sold well. {{a2.edition}} lists at {{a2.list_price}}. ") + g.flush()).toBe("Post Alley (Hardcover) lists at $27.99. Post Alley (Hardcover) sold well. Post Alley (Trade paperback) lists at $17.99. ");
    // A withheld sentence in between doesn't end it (Probe's and Audit's reviews of #235).
    g = gate();
    expect(g.push("{{a1.edition}} lists at {{a1.list_price}}. It fell. The Lantern Hours does too. ") + g.flush()).toBe(`Post Alley (Hardcover) lists at $27.99. ${WITHHELD} `);
    // Carry-over words stay withheld for the rest of the paragraph; a new paragraph starts afresh.
    g = gate();
    expect(g.push("{{a1.edition}} lists at {{a1.list_price}}. The table is under this message. Indeed. It also has the paperback.\n\nThe paperback also sold well. ") + g.flush()).toBe(`Post Alley (Hardcover) lists at $27.99. The table is under this message. Indeed. ${WITHHELD}\n\nThe paperback also sold well. `);
  });

  it("let an exact edition label into prose, digits and all, as titles are (#225, item 4)", () => {
    expect(say("Heliotrope Pajamas (Paperback, 2181) sold {{a3}}.", r)).toBe("Heliotrope Pajamas (Paperback, 2181) sold $95.88.");
    expect(say("Heliotrope Pajamas (Paperback, 2182) sold {{a3}}.", r)).toBe(WITHHELD);
  });

  it("keep a price group apart from any book", () => {
    expect(say("Every title in {{b.list_price}} sold {{b.total}} units.", r)).toBe("Every title in $27.99 sold 51 units.");
    expect(say("{{a2.edition}} is among the books in {{b.list_price}}.", r)).toBe(WITHHELD);
  });

  it("never call revenue or average order value a price (paying words included)", () => {
    expect(say("{{a1.edition}} costs {{a1}}.", r)).toBe(WITHHELD);
    expect(say("The average price is {{c.total}}.", r)).toBe(WITHHELD);
    expect(say("What people paid came to {{c.total}}.", r)).toBe(WITHHELD);
    expect(say("The shop charged {{a1}}.", r)).toBe(WITHHELD);
    expect(say("Its sales were worth {{a.total}}.", r)).toBe(WITHHELD);
    expect(say("Revenue came to {{a.total}}.", r)).toBe("Revenue came to $2,135.03.");
    expect(say("The average order value was {{c.total}}.", r)).toBe("The average order value was $31.20.");
  });

  it("withhold price comparatives and judgments", () => {
    for (const sentence of ["The hardcover is the cheapest edition.", "The paperback is pricier.", "It is expensive.", "It is a bargain.", "It sits in the budget band.", "It costs a buck."]) expect(say(sentence, r), sentence).toBe(WITHHELD);
  });

  it("withhold a bound put on a figure, but not the words themselves", () => {
    expect(say("{{a2.edition}} costs under {{a2.list_price}}.", r)).toBe(WITHHELD);
    expect(say("Revenue was over {{a.total}}.", r)).toBe(WITHHELD);
    expect(say("Every title in {{b.list_price}} sold at least {{b.total}} units.", r)).toBe(WITHHELD);
    // The gate's own fallback, and "over" a row count, which isn't a bound (Goldy).
    expect(say("The table is under this message.", r)).toBe("The table is under this message.");
    expect(say("Revenue came to {{a.total}} over {{a.rows}} editions.", r)).toBe("Revenue came to $2,135.03 over 3 editions.");
  });
});

describe("look-alike letters (Probe's review of #229)", () => {
  it("read as the plain word: marks stripped, Latin look-alikes mapped", () => {
    for (const sentence of ["Revenue was hìgher in {{a4.quarter}}.", "Revenue was hi\u0307gher in {{a4.quarter}}.", "Revenue was hıgher in {{a4.quarter}}.", "Fívé units sold."]) expect(say(sentence), sentence).toBe(WITHHELD);
  });

  it("withhold any letter that isn't A to Z once accents are off: other scripts, small capitals (Audit)", () => {
    for (const sentence of ["Fiv\u0435 units sold.", "Revenue was h\u0456gher in {{a4.quarter}}.", "Revenue was l\u03BFwer in {{a4.quarter}}.", "Revenue was hɪgher in {{a4.quarter}}.", "ꜰɪᴠᴇ units sold.", "Revenue went ᴜp.", "Revenue was loᴡer in {{a4.quarter}}.", "Revenue was hıgher in {{a4.quarter}}.", "ʜɪɢʜᴇʀ revenue.", "Revenue was hɩgher in {{a4.quarter}}."]) expect(say(sentence), sentence).toBe(WITHHELD);
    expect(hasBannedWord("WE SOLD ꜰɪᴠᴇ BOOKS.")).toBe(true);
  });

  it("keep the catalog's own accent: Karénine is an author's name", () => {
    expect(say("I looked up units by author for Karénine's books.")).toBe("I looked up units by author for Karénine's books.");
  });
});

describe("\"look up\" (Audit's review of #244)", () => {
  it("is allowed as looking something up, with its object or after a subject or auxiliary", () => {
    for (const sentence of ["I looked up revenue in {{a4.quarter}}: {{a4}}.", "I’ve looked up revenue in {{a4.quarter}}: {{a4}}.", "I looked it up: {{a4}}.", "To look up revenue by quarter, ask me.", "I can look things up for you."]) {
      expect(say(sentence), sentence).not.toBe(WITHHELD);
    }
  });
  it("but never as the improvement idiom, which states a direction", () => {
    for (const sentence of ["Sales are looking up in {{a4.quarter}}.", "Things are looking up.", "Revenue looks up in {{a4.quarter}}."]) expect(say(sentence), sentence).toBe(WITHHELD);
  });
});
