// Static check of the ref design's lexical gate at a82bb9b: which of Dewey's own words would reach the screen.
// usage: node refcheck.ts, from a checkout of the branch under test (imports its figures.server.ts).
// Refs: one compare_data result, "a", revenue from 2193-Q2 to 2193-Q4 (change -2,912.25), as the real tool returns it.
import { Refs, renderSentence, titleIsClean } from "../../../../src/assistant/server/figures.server.ts";
const refs = new Refs();
refs.addTool("compare_data", { measure: "revenue", across: "quarter", from: "2193-Q2", to: "2193-Q4" }, {
  ref: "a", rows: [], columns: [{ key: "from", label: "2193-Q2" }, { key: "to", label: "2193-Q4" }],
  total: { from: 164436.94, to: 161524.69, change: -2912.25, percent_change: -1.771 }, direction: "fell",
  source: "allowed periods: 2193-Q1, 2193-Q2, 2193-Q3, 2193-Q4" });
const cases: [string, string][] = [
  ["control: ref only", "I compared revenue, all genres. {{a.from_vs_to}}."],
  ["control: banned direction", "Q2 was higher than Q4."],
  ["G1 wording, banned word", "It didn't run higher than Q4."],
  ["direction: outpaced", "Q2 outpaced Q4."],
  ["direction: negated, lagged", "Q2 didn't lag behind Q4."],
  ["direction: lagged", "Q2 lagged Q4."],
  ["direction: overtook", "Q4 overtook Q2."],
  ["direction: surpassed", "Q4 surpassed Q2."],
  ["direction: weaker / stronger", "Q4 was the stronger quarter, Q2 the weaker."],
  ["direction: shrank / sank", "Revenue sank from Q2 to Q4."],
  ["direction: tumbled / soared", "Q4 revenue soared."],
  ["direction: better / worse", "Q4 did better than Q2."],
  ["direction: exceeding", "Q4 revenue, exceeding Q2's, ..."],
  ["direction: peaked", "Revenue peaked in Q4."],
  ["number: tenfold", "Q4 was tenfold Q2."],
  ["number: a dozen", "That's about a dozen titles."],
  ["number: a couple", "A couple of genres moved."],
  ["number: fullwidth digits", "Revenue was １６１,５２５."],
  ["number: Arabic-Indic digits", "Revenue was ١٦١٥٢٥."],
  ["number: vulgar fraction", "Q4 was about ¾ of Q2."],
  ["number: roman numeral", "Chapter XII of the ledger."],
  ["number: percent word", "A few percent."],
  ["number: grand", "About a hundred and sixty grand."],
  ["ref: forged", "It was {{z9}}."],
  ["ref: unknown field", "It was {{a.secret}}."],
  ["ref: row from another answer", "It was {{b3}}."],
];
for (const [label, s] of cases) { const r = renderSentence(s, refs); console.log(`${r ? "shown   " : "WITHHELD"}  ${label.padEnd(34)} ${JSON.stringify(s)}${r ? "  -> " + JSON.stringify(r.text) : ""}`); }
for (const t of ["Q4 overtook Q2", "Q4 down 45% on Q3", "Revenue soared in Q4", "Revenue soared in autumn", "Autumn outsold summer", "Autumn outpaced summer"]) console.log(`pin title ${titleIsClean(t) ? "kept    " : "REPLACED"} ${JSON.stringify(t)}`);
