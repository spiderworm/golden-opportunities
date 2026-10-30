// Static check of figures.server.ts at cbeae73: which ways of writing a made-up figure get flagged.
// usage: node figcheck.ts, from a checkout of the branch under test (it imports that branch's src/assistant/server/figures.server.ts).
// Known numbers: what a lookup of Q3 and Q4 revenue returns (two totals), plus the quarter labels.
import { numbersIn, unbackedFigures } from "../../../../src/assistant/server/figures.server.ts";
const known = numbersIn({ rows: [{ quarter: "2193-Q3", revenue: 274036.165 }, { quarter: "2193-Q4", revenue: 161524.6946 }], total: 435560.86 });
const cases: [string, string][] = [
  ["control: a made-up figure in digits", "Q3 was higher by 112,511.47."],
  ["control: a real figure, rounded", "Q4 revenue was about 161,500."],
  ["made-up, rounded to thousands", "Q3 was higher by about 113,000."],
  ["made-up, K suffix", "Q3 was higher by about $113K."],
  ["made-up, k suffix with decimal", "Q3 was higher by about $112.5k."],
  ["made-up, M suffix", "Year to date that's about $0.44M."],
  ["made-up, spelled out", "Q3 was higher by about one hundred and twelve thousand dollars."],
  ["made-up, mixed words", "Q3 was higher by about 112 thousand dollars."],
  ["made-up percent, spelled out", "Q4 fell by about forty-one percent."],
  ["made-up percent in digits", "Q4 fell by about 41%."],
  ["made-up share as a fraction", "Q4 was about 3/5 of Q3."],
  ["made-up ratio as words", "Q3 was nearly double Q4; Q4 was roughly a third of the year."],
  ["made-up small percent", "Q4 fell 7%."],
  ["made-up small integer", "Q4 fell by 9 in every 10 dollars."],
  ["made-up with a space separator", "Q3 was higher by 112 511 dollars."],
  ["made-up multiplier", "Q3 was 1.7x Q4."],
  ["made-up as a coincidental match", "Q3 was higher by 2,193 orders."],
];
for (const [label, text] of cases) { const u = unbackedFigures(text, known); console.log(`${u.length ? "FLAGGED " : "passes  "} ${label.padEnd(40)} ${JSON.stringify(text)}${u.length ? "  -> " + u.map((f) => f.text).join(", ") : ""}`); }
