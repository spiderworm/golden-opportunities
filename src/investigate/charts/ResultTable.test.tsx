import { renderToString } from "react-dom/server";
import { expect, it } from "vitest";
import type { QueryResult } from "~/query/types";
import { lastYearLabels } from "./last-year";
import { LastYearTable, ResultTable } from "./ResultTable";

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

it("gives last year's table a Based on column for an average, both years, and fades a row with few", () => {
  const result: QueryResult = {
    ...ratings([212, 8]),
    lastYear: {
      rows: [{ value: 4.2 }, { value: 4.5 }],
      total: { value: 4.3 },
      evidence: {
        rows: [
          { n: 180, se: 0.1 },
          { n: 40, se: 0.2 },
        ],
        total: { n: 220, se: 0.09 },
      },
    },
  };
  const html = renderToString(
    <LastYearTable
      result={result}
      by="title"
      measure="avg_rating"
      labels={lastYearLabels("2194-Q1", "title")}
    />,
  );
  expect(text(html)).toContain("|% change|Based on|");
  expect(text(html)).toContain("|212 and 180 ratings|");
  expect(text(html)).toContain("|8 and 40 ratings|");
  expect(html.match(/<tr class="[^"]*faded/g)).toHaveLength(1);
  expect(text(html)).toContain("Faded where there are fewer than 30 ratings");
});
