import { describe, expect, it } from "vitest";
import { Evidence, figuresIn, scrubDeep, sentenceGate, WITHHELD } from "./figures.server.ts";

const query = (measure: string, rows: Record<string, unknown>[], total: number | null, by: string[] = []) => ["query_data", { measure, by }, { columns: [], rows, total, source: "S" }] as const;
const evidence = (...tools: (readonly [string, unknown, unknown])[]) => {
  const e = new Evidence();
  for (const [name, input, output] of tools) e.addTool(name, input, output);
  return e;
};
const unbacked = (e: Evidence, text: string) => e.unbacked(text).map((f) => f.text);

describe("figures in a reply", () => {
  it("reads sign, unit and the precision each is written to", () => {
    const read = (t: string) => figuresIn(t).map((f) => [f.value, f.sign, f.unit, f.place]);
    expect(read("$161,524.69 in 2193-Q4, 3rd")).toEqual([[161524.69, 0, "currency", 0.01]]);
    expect(read("-$123.45, +59.8%, −4, 15 %, 12 percent")).toEqual([
      [123.45, -1, "currency", 0.01],
      [59.8, 1, "percent", 0.1],
      [4, -1, "plain", 1],
      [15, 0, "percent", 1],
      [12, 0, "percent", 1],
    ]);
    expect(read("about 95,000, $63.8k, 1.2 million")).toEqual([
      [95000, 0, "plain", 1000],
      [63800, 0, "currency", 100],
      [1200000, 0, "plain", 100000],
    ]);
  });
});

describe("what backs a figure", () => {
  const revenue = evidence(query("revenue", [{ quarter: "2193-Q4", revenue: 63843.2 }], 63843.2, ["quarter"]));

  it("a measured value rounded to what's written, with the same unit", () => {
    expect(unbacked(revenue, "Revenue was 63,843, $63,843.20, $63.8k, about $64,000 or 63,843.2.")).toEqual([]);
    expect(unbacked(revenue, "Revenue was 63,844 or $63.9k.")).toEqual(["63,844", "$63.9k"]);
  });

  it("rounds at the boundary as rounding does, no further", () => {
    const e = evidence(query("revenue", [], 63842.5));
    expect(unbacked(e, "It was 63,843.")).toEqual([]);
    expect(unbacked(e, "It was 63,842.")).toEqual(["63,842"]);
  });

  it("the sign must match when one is written (Audit: +59.8% was backed by -59.79)", () => {
    const e = evidence(["compare_data", { measure: "orders_per_day" }, { columns: [], rows: [], total: { from: 195.15, to: 78.46, change: -116.69, percent_change: -59.7943 }, source: "S" }]);
    expect(unbacked(e, "Change was +59.8%.")).toEqual(["+59.8%"]);
    expect(unbacked(e, "Change was -59.8%, a drop of 59.8%, or −116.69.")).toEqual([]);
    expect(unbacked(evidence(query("revenue", [], 123.45)), "Revenue was -$123.45.")).toEqual(["-$123.45"]);
  });

  it("direction words are part of the sign: a rise needs a positive change, a fall a negative one (Goldy)", () => {
    // The real run: revenue from 2193-Q2 (164,436.94) to 2193-Q4 (161,524.69) fell 2,912.25, or -1.77%.
    const e = evidence(["compare_data", { measure: "revenue" }, { columns: [], rows: [], total: { from: 164436.94, to: 161524.69, change: -2912.25, percent_change: -1.7711, direction: "fell" }, source: "S" }]);
    expect(unbacked(e, "That is a rise of about 1.8% over Q4.")).toEqual(["1.8%"]);
    expect(unbacked(e, "Revenue grew 1.8%.")).toEqual(["1.8%"]);
    expect(unbacked(e, "Revenue increased by $2,912.")).toEqual(["$2,912"]);
    expect(unbacked(e, "Revenue was about $2,912 higher in 2193-Q2 than in 2193-Q4.")).toEqual(["$2,912"]);
    expect(unbacked(e, "Revenue rose -1.8%.")).toEqual(["-1.8%"]);
    expect(unbacked(e, "Revenue fell by about 2,912 from 2193-Q2 to 2193-Q4, a drop of 1.8%.")).toEqual([]);
    expect(unbacked(e, "Revenue declined 1.8%, or $2,912 lower.")).toEqual([]);
    expect(unbacked(e, "A change of -1.8%, or 1.8 percent.")).toEqual([]);
  });

  it("a direction word in one clause doesn't bind another, and levels are checked as levels", () => {
    const e = evidence(["compare_data", { measure: "units" }, { columns: [], rows: [{ genre: "Nonfiction", from: 278, to: 339, change: 61, percent_change: 21.94, direction: "rose" }, { genre: "SciFi/Fantasy", from: 7523, to: 4246, change: -3277, percent_change: -43.56, direction: "fell" }], total: { from: 7801, to: 4585, change: -3216, percent_change: -41.2, direction: "fell" }, source: "S" }]);
    expect(unbacked(e, "SciFi/Fantasy fell by 3,277, and Nonfiction rose by 61.")).toEqual([]);
    expect(unbacked(e, "SciFi/Fantasy rose by 3,277; Nonfiction fell by 61.")).toEqual(["3,277", "61"]);
    expect(unbacked(e, "Nonfiction rose from 278 to 339, up 21.9%.")).toEqual([]);
    // "Looked up" and "broken down" aren't directions; labels take none.
    const rate = evidence(["query_data", { measure: "units", by: ["month"], filter: { discount_rate: ["15%"] } }, { columns: [], rows: [{ month: "01", units: 658 }], total: 658, source: "S" }]);
    expect(unbacked(rate, "I looked up units at a 15% discount rate, broken down by month, 658 in all.")).toEqual([]);
    expect(unbacked(rate, "Units rose at the 15% rate.")).toEqual([]);
    // With no direction in its own clause, the sentence's applies.
    expect(unbacked(e, "Nonfiction fell the most, by about 21.9%.")).toEqual(["21.9%"]);
  });

  it("the unit must match: no free small figures, money only from money, percents only from percents", () => {
    expect(unbacked(new Evidence(), "Revenue was $7, or 3.")).toEqual(["$7", "3"]);
    const units = evidence(query("units", [], 15));
    expect(unbacked(units, "15 units, 15%, $15.")).toEqual(["15%", "$15"]);
    expect(unbacked(evidence(query("avg_discount", [], 0.15)), "An average discount of 15%, or 15 %.")).toEqual([]);
  });

  it("nothing the model sent counts: not a failed call's input, nor an echoed filter or pin title (Audit, #32)", () => {
    const e = evidence(
      query("revenue", [], 0),
      ["query_data", { measure: "revenue", by: [], filter: { title: ["63843"] } }, { columns: [], rows: [{ revenue: 0 }], total: 0, source: "S" }],
      ["pin_chart", { title: "Profit 63843" }, { pinned: true, chart: { title: "Profit 63843" }, rows: 1, source: "S" }],
    );
    expect(unbacked(e, "Gross profit was $63,843.")).toEqual(["$63,843"]);
  });

  it("labels the data returned back a figure written exactly so; what the player wrote doesn't (Probe)", () => {
    const e = evidence(query("units", [{ discount_rate: "15%", units: 658 }, { title: "Hashtag 42", units: 3 }], 661, ["discount_rate"]));
    expect(unbacked(e, "At the 15% rate, 658 units; Hashtag 42 sold 3.")).toEqual([]);
    expect(unbacked(e, "You said 60%, or $60, or 60.0%.")).toEqual(["60%", "$60", "60.0%"]);
  });

  it("a filter value is a label only where the data had something there", () => {
    const filtered = (total: number) => evidence(["query_data", { measure: "units", by: [], filter: { discount_rate: ["15%"], title: ["63843"] } }, { columns: [], rows: [{ units: total }], total, source: "S" }]);
    expect(unbacked(filtered(658), "At 15%, 658 units.")).toEqual([]);
    expect(unbacked(filtered(0), "At 15%, 63843 of them.")).toEqual(["15%", "63843"]);
  });

  it("years and periods are names, not figures, and back nothing (Probe: 2193 backed 2,193)", () => {
    const e = evidence(query("units", [{ quarter: "2193-Q4", units: 13093 }], 13093, ["quarter"]));
    expect(figuresIn("In 2193-Q4, Q4 2193 and 2193 overall.")).toEqual([]);
    expect(unbacked(e, "2193-Q4 had 13,093 units in 2193.")).toEqual([]);
    expect(unbacked(e, "That's 2,193 units, or $2193.")).toEqual(["2,193", "$2193"]);
  });

  it("reads K and M suffixes (Probe: $113K)", () => {
    const e = evidence(query("revenue", [], 113_240), query("units", [], 1_240_000));
    expect(unbacked(e, "Revenue was $113K, or $113.2k; units 1.24M or 1.2 million.")).toEqual([]);
    expect(unbacked(e, "Revenue was $114K; units 2M.")).toEqual(["$114K", "2M"]);
  });

  it("reads number words, but not one to ten on their own (Probe: sixty-three thousand)", () => {
    expect(figuresIn("sixty-three thousand five hundred, twenty-one percent, a hundred").map((f) => [f.value, f.unit, f.place])).toEqual([
      [63500, "plain", 100],
      [21, "percent", 1],
      [100, "plain", 100],
    ]);
    const e = evidence(query("revenue", [], 63_210));
    expect(unbacked(e, "About sixty-three thousand dollars, from two lookups.")).toEqual([]);
    expect(unbacked(e, "About sixty-four thousand, or seventeen.")).toEqual(["sixty-four thousand", "seventeen"]);
  });

  it("never backs a ratio, since no tool returns one (Probe: 1.7x, two-thirds)", () => {
    const e = evidence(query("units", [], 1.7), query("units", [], 3));
    expect(unbacked(e, "Q3 sold 1.7x as many, 3 times as many, twice as many, two-thirds of them, a third of the orders, half the titles, 1/3, one in five.").length).toBe(8);
    expect(unbacked(e, "In a quarter, 3 units; 3 sold in 2193.")).toEqual([]);
  });

  it("compared values are labels only where the data had something", () => {
    const compare = (from: number, to: number) => evidence(["compare_data", { measure: "units" }, { columns: [{ key: "from", label: "2193-Q2" }, { key: "to", label: "63843" }], rows: [], total: { from, to, change: to - from, percent_change: null }, source: "S" }]);
    expect(unbacked(compare(5, 0), "From 2193-Q2 to 63843.")).toEqual(["63843"]);
  });
});

describe("the sentence gate", () => {
  const e = evidence(query("revenue", [], 161524.69));

  it("shows backed sentences whole, and withholds any with a figure nothing backs", () => {
    const gate = sentenceGate(e);
    expect(gate.push("Q4 revenue was 161,5")).toBe("");
    expect(gate.push("24.69. Gross profit was $63,843. Cost was $97,682.\n\nThe table")).toBe(`Q4 revenue was 161,524.69. ${WITHHELD}\n\n`);
    expect(gate.push(" is under this message.")).toBe("");
    expect(gate.flush()).toBe("The table is under this message.");
    expect(gate.withheld).toBe(2);
  });

  it("withholds a figure stated before its lookup came back", () => {
    const later = new Evidence();
    const gate = sentenceGate(later);
    expect(gate.push("It was 5. ")).toBe(`${WITHHELD} `);
    later.addTool(...query("units", [], 5));
    expect(gate.push("It was 5. ")).toBe("It was 5. ");
  });
});

it("scrubDeep hides a secret in every string, keys included", () => {
  expect(scrubDeep({ type: "pin", chart: { title: "code abc123" }, list: ["abc123"], abc123: 1 }, "abc123")).toEqual({ type: "pin", chart: { title: "code [hidden]" }, list: ["[hidden]"], "[hidden]": 1 });
});
