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
const CALENDAR: readonly Dimension[] = ["quarter", "month", "weekday"];

const LABELS: Record<Dimension | Measure, string> = {
  quarter: "Quarter", month: "Month", weekday: "Weekday", genre: "Genre", format: "Format",
  publisher: "Publisher", series: "Series", title: "Title", author: "Author", discounted: "Discounted",
  discount_rate: "Discount rate",
  revenue: "Revenue", units: "Items sold", orders: "Orders", avg_discount: "Average discount",
  avg_rating: "Average rating", checkouts: "Checkouts", avg_order_value: "Average order value",
  orders_per_day: "Orders per day",
};

function calendarValue(date: string, dimension: Dimension): string {
  if (dimension === "quarter") return `${date.slice(0, 4)}-Q${Math.ceil(Number(date.slice(5, 7)) / 3)}`;
  if (dimension === "month") return date.slice(5, 7);
  const [y, m, d] = date.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()]!;
}

function value(line: Line, dimension: Dimension): string | null {
  switch (dimension) {
    case "quarter":
    case "month":
    case "weekday":
      return calendarValue(line.date, dimension);
    case "genre": return line.genre;
    case "format": return line.format;
    case "publisher": return line.publisher.name;
    case "series": return line.book.series?.name ?? null;
    case "title": return line.title;
    case "author": return `${line.author.firstName} ${line.author.lastName}`;
    case "discounted": return line.discount > 0 ? "yes" : "no";
    case "discount_rate": return `${Number((line.discount * 100).toFixed(8))}%`;
  }
}

/** Every calendar date in the visible periods ("2193-Q4"), as YYYY-MM-DD. */
function visibleDays(periods: readonly string[]): string[] {
  const days: string[] = [];
  for (const period of periods) {
    const year = Number(period.slice(0, 4));
    const q = Number(period.slice(-1));
    for (let t = Date.UTC(year, (q - 1) * 3, 1); t < Date.UTC(year, q * 3, 1); t += 86_400_000) {
      days.push(new Date(t).toISOString().slice(0, 10));
    }
  }
  return days;
}

function aggregate(lines: readonly Line[], measure: Measure, days: number): number | null {
  const orders = () => new Set(lines.map((l) => l.orderId)).size;
  const revenue = () => lines.reduce((sum, l) => sum + l.revenue, 0);
  switch (measure) {
    case "revenue": return revenue();
    case "units": return lines.length;
    case "orders": return orders();
    case "avg_discount": return lines.length ? lines.reduce((sum, l) => sum + l.discount, 0) / lines.length : null;
    case "avg_order_value": return orders() ? revenue() / orders() : null;
    case "orders_per_day": return days ? orders() / days : null;
    default: throw new Error(`The query stub doesn't support ${measure}`);
  }
}

function compare(dimension: Dimension, a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (dimension === "weekday") return WEEKDAY_ORDER.indexOf(a) - WEEKDAY_ORDER.indexOf(b);
  if (dimension === "discount_rate") return parseFloat(a) - parseFloat(b);
  return a < b ? -1 : 1;
}

export function runQuery(query: Query, view: QueryView): QueryResult {
  const { measure, by, filter = {} } = query;
  const visible = loadBookshop().saleLines.filter((l) => view.periods.includes(value(l, "quarter") as never));
  const matching = visible.filter((l) =>
    Object.entries(filter).every(([dimension, values]) => values!.includes(value(l, dimension as Dimension) ?? "")),
  );

  // orders_per_day divides by eligible calendar days: the visible days, narrowed
  // by calendar filters and the group's own calendar values. Zero-sale days count.
  const days = visibleDays(view.periods).filter((day) =>
    CALENDAR.every((d) => !filter[d] || filter[d]!.includes(calendarValue(day, d))),
  );
  const daysFor = (keys: (string | null)[]) =>
    days.filter((day) => by.every((d, i) => !CALENDAR.includes(d) || calendarValue(day, d) === keys[i])).length;

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
      const row: QueryRow = { [measure]: aggregate(lines, measure, daysFor(keys)) };
      by.forEach((d, i) => (row[d] = keys[i]));
      return row;
    });

  const columns: QueryColumn[] = [
    ...by.map((key): QueryColumn => ({ key, label: LABELS[key], type: "string", nullable: true })),
    { key: measure, label: LABELS[measure], type: "number", nullable: measure.startsWith("avg_") || measure === "orders_per_day" },
  ];
  if (by.length === 0 && rows.length === 0) rows.push({ [measure]: aggregate(matching, measure, days.length) });

  return {
    columns,
    rows: rows.slice(0, query.limit ?? 200),
    total: aggregate(matching, measure, days.length),
    source: `Bookshop sales lines, ${view.periods.join(", ")} (development stub)`,
  };
}
