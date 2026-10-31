// A comparison as two queries and the arithmetic between them: pure, so Dewey's tool server and a pinned
// comparison on Investigate work it out the same way, each running the queries through POST /api/query.

import type { QueryColumn, QueryResult } from "../../query/types.ts";
import { checkQuery, type Comparison, type ComparisonFigures, type ComparisonResult } from "./definitions.ts";

/** The two queries a comparison runs, one per side; each is grouped by the compared dimension too. */
export function comparisonQueries(c: Comparison) {
  const side = (value: string) => checkQuery({ measure: c.measure, by: [...c.by, c.across], filter: { ...c.filter, [c.across]: [value] } });
  return [side(c.from), side(c.to)] as const;
}

const figures = (from: number | null | undefined, to: number | null | undefined): ComparisonFigures => {
  const a = typeof from === "number" ? from : null;
  const b = typeof to === "number" ? to : null;
  const change = a === null || b === null ? null : b - a;
  const direction = change === null ? null : change > 0 ? "rose" : change < 0 ? "fell" : "unchanged";
  return { from: a, to: b, change, percent_change: change === null || !a ? null : (change / Math.abs(a)) * 100, direction };
};

/**
 * Works out the change from the two sides' results, so the assistant never does arithmetic of its own. The
 * compared values are the model's free text, so they appear in headings and the source only as the data
 * returned them; a side that matched nothing is named in fixed words (Audit, #32).
 */
export function combineComparison(c: Comparison, a: Pick<QueryResult, "columns" | "rows" | "total" | "source">, b: Pick<QueryResult, "columns" | "rows" | "total" | "source">): ComparisonResult {
  const labelOf = (rows: QueryResult["rows"]) => {
    const value = rows.find((r) => typeof r[c.across] === "string")?.[c.across];
    return typeof value === "string" ? value : null;
  };
  const labels = { from: labelOf(a.rows), to: labelOf(b.rows) };
  const dim = c.by[0];
  const number = (label: string, key: string): ComparisonResult["columns"][number] => ({ key, label, type: "number", nullable: true });
  const columns = [
    ...(dim ? [a.columns.find((col: QueryColumn) => col.key === dim) ?? { key: dim, label: dim, type: "string" as const, nullable: true }] : []),
    number(labels.from ?? "First value", "from"),
    number(labels.to ?? "Second value", "to"),
    number("Change", "change"),
    number("Change (%)", "percent_change"),
  ];
  let rows: ComparisonResult["rows"] = [];
  if (dim) {
    const key = (row: Record<string, unknown>) => (row[dim] ?? null) as string | null;
    const toByKey = new Map(b.rows.map((r) => [key(r), r[c.measure]]));
    const keys = [...new Set([...a.rows.map(key), ...b.rows.map(key)])];
    const fromByKey = new Map(a.rows.map((r) => [key(r), r[c.measure]]));
    rows = keys.map((k) => ({ [dim]: k, ...figures(fromByKey.get(k), toByKey.get(k)) }));
  }
  const source = [
    `${c.measure} compared across ${c.across}, ${labels.from ?? "the first value"} against ${labels.to ?? "the second value"}.`,
    ...(labels.from ? [] : ["No sales matched the first value."]),
    ...(labels.to ? [] : ["No sales matched the second value."]),
    "Change is the second minus the first; percent change is that change divided by the first, worked out by the data terminal.",
    `${labels.from ?? "First value"}: ${a.source}`,
    `${labels.to ?? "Second value"}: ${b.source}`,
  ].join(" ");
  return { columns, rows, total: figures(a.total, b.total), labels, source };
}
