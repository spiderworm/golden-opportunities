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

// Several measures in one lookup (Plot, section 11).
const several: QueryResult = {
  columns: [
    { key: "genre", label: "Genre", type: "string", nullable: true },
    { key: "revenue", label: "Revenue", type: "number", nullable: false },
    { key: "avg_order_value", label: "Average order value", type: "number", nullable: true },
    { key: "units", label: "Units sold", type: "number", nullable: false },
  ],
  rows: [
    { genre: "Fiction", revenue: 1200, avg_order_value: 24, units: 80 },
    { genre: "Poetry", revenue: 90, avg_order_value: 18, units: 5 },
  ],
  total: 1290,
  source: "S",
  evidence: { unit: null, rows: [], total: { n: 85, se: 0 } },
  measures: {
    revenue: { total: 1290, evidence: { unit: null, rows: [], total: { n: 85, se: 0 } } },
    avg_order_value: {
      total: 23.5,
      evidence: {
        unit: "orders",
        rows: [
          { n: 50, se: 1 },
          { n: 4, se: 3 },
        ],
        total: { n: 54, se: 1 },
      },
    },
    units: { total: 85, evidence: { unit: null, rows: [], total: { n: 85, se: 0 } } },
  },
};

it("gives several measures a column each, in order, with an average's Based on after it and All last", () => {
  const html = renderToString(<ResultTable result={several} />);
  expect(text(html)).toContain("|Genre|Revenue|Average order value|Based on|Units sold|");
  expect(text(html)).toContain("|Fiction|$1,200|$24.00|50 orders|80|");
  expect(text(html)).toContain("|All|$1,290|$23.50|54 orders|85|");
  expect(html).toContain('aria-label="Based on, average order value"');
});

it("fades only the figure over too few, not its row, and says so under the table", () => {
  const html = renderToString(<ResultTable result={several} />);
  // Poetry's average order value and its count: two cells, while its revenue and units stay as they are.
  expect(html.match(/fadedCell/g)).toHaveLength(2);
  expect(html).not.toMatch(/<tr class="[^"]*faded/);
  expect(text(html)).toContain("Faded where there are fewer than 30 orders");
});

it("gives an average rating's cell its likely range, and one measure's table stays as it was", () => {
  const books: QueryResult = {
    columns: [
      { key: "genre", label: "Genre", type: "string", nullable: true },
      { key: "avg_rating", label: "Average rating", type: "number", nullable: true },
      { key: "checkouts", label: "Checkouts", type: "number", nullable: false },
    ],
    rows: [{ genre: "Fiction", avg_rating: 4.1, checkouts: 300 }],
    total: 4.1,
    source: "S",
    measures: {
      avg_rating: {
        total: 4.1,
        evidence: { unit: "ratings", rows: [{ n: 212, se: 0.05 }], total: { n: 212, se: 0.05 } },
      },
      checkouts: { total: 300, evidence: { unit: null, rows: [], total: { n: 300, se: 0 } } },
    },
  };
  expect(renderToString(<ResultTable result={books} />)).toMatch(
    /title="Likely range: [\d.]+ to [\d.]+ stars"/,
  );
  // One measure, even with `measures` filled in: the single table, with no All row.
  const one: QueryResult = {
    ...ratings([212]),
    measures: { avg_rating: { total: 4, evidence: ratings([212]).evidence! } },
  };
  expect(text(renderToString(<ResultTable result={one} />))).not.toContain("|All|");
});
