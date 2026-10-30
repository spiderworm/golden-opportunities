// TEMPORARY stand-in for Frank's runQuery (src/query/run-query.server.ts).
// It follows the contract in src/query/contract.md for the sales measures the
// Investigate screen uses, so the screen sees real figures. Delete this file
// and import the real runQuery when it merges.
import { loadBookshop } from "~/bookshop/loader.server";
import type { DeepReadonly, SaleLine } from "~/bookshop/types";
import type { Dimension, Measure, Query, QueryColumn, QueryResult, QueryRow, QueryView } from "~/query/types";

type Line = DeepReadonly<SaleLine>;

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const LABELS: Record<Dimension | Measure, string> = {
  quarter: "Quarter", month: "Month", weekday: "Weekday", genre: "Genre", format: "Format",
  publisher: "Publisher", series: "Series", title: "Title", author: "Author", discounted: "Discounted",
  revenue: "Revenue", units: "Items sold", orders: "Orders", avg_discount: "Average discount",
  avg_rating: "Average rating", checkouts: "Checkouts",
};

function value(line: Line, dimension: Dimension): string | null {
  switch (dimension) {
    case "quarter": return `${line.date.slice(0, 4)}-Q${Math.ceil(Number(line.date.slice(5, 7)) / 3)}`;
    case "month": return line.date.slice(5, 7);
    case "weekday": {
      const [y, m, d] = line.date.split("-").map(Number);
      return WEEKDAYS[new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()]!;
    }
    case "genre": return line.genre;
    case "format": return line.format;
    case "publisher": return line.publisher.name;
    case "series": return line.book.series?.name ?? null;
    case "title": return line.title;
    case "author": return `${line.author.firstName} ${line.author.lastName}`;
    case "discounted": return line.discount > 0 ? "yes" : "no";
  }
}

function aggregate(lines: readonly Line[], measure: Measure): number | null {
  switch (measure) {
    case "revenue": return lines.reduce((sum, l) => sum + l.revenue, 0);
    case "units": return lines.length;
    case "orders": return new Set(lines.map((l) => l.orderId)).size;
    case "avg_discount": return lines.length ? lines.reduce((sum, l) => sum + l.discount, 0) / lines.length : null;
    default: throw new Error(`The query stub doesn't support ${measure}`);
  }
}

function compare(dimension: Dimension, a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (dimension === "weekday") return WEEKDAY_ORDER.indexOf(a) - WEEKDAY_ORDER.indexOf(b);
  return a < b ? -1 : 1;
}

export function runQuery(query: Query, view: QueryView): QueryResult {
  const { measure, by, filter = {} } = query;
  const visible = loadBookshop().saleLines.filter((l) => view.periods.includes(value(l, "quarter") as never));
  const matching = visible.filter((l) =>
    Object.entries(filter).every(([dimension, values]) => values!.includes(value(l, dimension as Dimension) ?? "")),
  );

  const groups = new Map<string, { keys: (string | null)[]; lines: Line[] }>();
  for (const line of matching) {
    const keys = by.map((d) => value(line, d));
    const id = JSON.stringify(keys);
    const group = groups.get(id) ?? groups.set(id, { keys, lines: [] }).get(id)!;
    group.lines.push(line);
  }

  const rows: QueryRow[] = [...groups.values()]
    .sort((a, b) => {
      for (let i = 0; i < by.length; i++) {
        const order = compare(by[i]!, a.keys[i]!, b.keys[i]!);
        if (order) return order;
      }
      return 0;
    })
    .map(({ keys, lines }) => {
      const row: QueryRow = { [measure]: aggregate(lines, measure) };
      by.forEach((d, i) => (row[d] = keys[i]));
      return row;
    });

  const columns: QueryColumn[] = [
    ...by.map((key): QueryColumn => ({ key, label: LABELS[key], type: "string", nullable: true })),
    { key: measure, label: LABELS[measure], type: "number", nullable: measure === "avg_discount" },
  ];
  if (by.length === 0 && rows.length === 0) rows.push({ [measure]: aggregate(matching, measure) });

  return {
    columns,
    rows: rows.slice(0, query.limit ?? 200),
    total: aggregate(matching, measure),
    source: `Bookshop sales lines, ${view.periods.join(", ")} (development stub)`,
  };
}
