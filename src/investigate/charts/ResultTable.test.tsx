import { renderToString } from "react-dom/server";
import { expect, it } from "vitest";
import type { QueryResult } from "~/query/types";
import { ResultTable } from "./ResultTable";

const ratings = (counts: number[]): QueryResult => ({
  columns: [
    { key: "title", label: "Title", type: "string", nullable: true },
    { key: "avg_rating", label: "Average rating", type: "number", nullable: true },
  ],
  rows: counts.map((_, i) => ({ title: `Book ${i}`, avg_rating: 4 })),
  total: 4,
  source: "S",
  evidence: {
    unit: "ratings",
    rows: counts.map((n) => ({ n, se: 0.1 })),
    total: { n: counts.reduce((t, n) => t + n, 0), se: 0.05 },
  },
});
const text = (html: string) => html.replace(/<[^>]+>/g, "|").replace(/\|+/g, "|");

it("gives an average a Based on column, and fades a row with too few to go on", () => {
  const html = renderToString(<ResultTable result={ratings([212, 8])} />);
  expect(text(html)).toContain("|Title|Average rating|Based on|");
  expect(text(html)).toContain("|212 ratings|");
  expect(text(html)).toContain("|8 ratings|");
  expect(html.match(/<tr class="[^"]*faded/g)).toHaveLength(1);
  expect(text(html)).toContain("Faded where there are fewer than 30 ratings");
});

it("says nothing about fading when every row has enough, and adds nothing to other measures", () => {
  expect(renderToString(<ResultTable result={ratings([212, 40])} />)).not.toMatch(/Faded/);
  const units: QueryResult = {
    columns: [{ key: "units", label: "Units", type: "number", nullable: false }],
    rows: [{ units: 9 }],
    total: 9,
    source: "S",
    evidence: { unit: null, rows: [{ n: 9, se: 3 }], total: { n: 9, se: 3 } },
  };
  expect(renderToString(<ResultTable result={units} />)).not.toMatch(/Based on/);
});
