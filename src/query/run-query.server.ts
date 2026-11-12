import { createHash } from "node:crypto";
import { loadBookshop } from "../bookshop/loader.server";
import type { DeepReadonly, JoinedBook, SaleLine } from "../bookshop/types";
import { QueryError } from "./errors";
import { validateQuery } from "./validate";
import { validateView } from "./view.server";
import { emit, trackQuery } from "./telemetry.server";
import { eligibleDays, groupDays, CALENDAR_DIMENSIONS, WEEKDAYS } from "./calendar";
import { checkLabel, serializeResult } from "./result";
import { isSalesMeasure, PRICE_BANDS, QUERY_LIMITS, queryMeasures } from "./types";
import { rollUpSales, type SaleCells } from "./sale-cells";
import { lastYearMissing, lastYearQuery, quartersCovered, yearEarlier } from "./last-year";
import { resolveQuery } from "./relative";
import { byDate, EVENT_RANK, MAX_EVENTS, quarterOfDate, type ViewEvent } from "./events";
import { evidenceUnit, type Evidence } from "./evidence";
import type {
  Dimension,
  Measure,
  Query,
  QueryResult,
  LastYear,
  MeasureEvidence,
  QueryRow,
  QueryTrack,
  QueryView,
} from "./types";

const labels: Record<Dimension | Measure, string> = {
  quarter: "Quarter",
  month: "Month",
  weekday: "Weekday",
  genre: "Genre",
  format: "Format",
  publisher: "Publisher",
  series: "Series",
  title: "Title",
  author: "Author",
  discounted: "Discounted",
  discount_rate: "Discount rate",
  stars: "Stars",
  awarded: "Award winner",
  award: "Award",
  volume: "Series volume",
  in_series: "In a series",
  edition: "Edition",
  list_price: "List price",
  price_band: "Price band",
  revenue: "Revenue",
  units: "Units",
  orders: "Orders",
  avg_discount: "Average discount",
  avg_rating: "Average rating",
  checkouts: "Checkouts",
  avg_order_value: "Average order value",
  orders_per_day: "Orders per day",
  ratings: "Ratings",
};
const weekdayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
type Dimensions = Partial<Record<Dimension, string | null>>;
/** A fact from a sale cell (sale-cells.ts) stands for `weight` lines, with `orders` distinct orders among them. */
interface Fact {
  dimensions: Dimensions;
  /** A rating's stars, a checkout row's count, or 1 for a sale line. */
  value: number;
  /** A sale line's revenue in millionths and its discount in basis points, when a measure asked needs them. */
  revenue?: number;
  discount?: number;
  orderId?: string;
  simulated?: boolean;
  awards?: readonly string[];
  weight?: number;
  cell?: number;
  orders?: number;
  /** A cell's sum over its orders of their lines in it, squared (sale-cells.ts). */
  squares?: number;
}
/**
 * Distinct orders: those of lines in a set, plus those of cells as counted, less the orders counted in more than one
 * of the aggregate's cells (`overlap`), so an order spanning cells is counted once.
 */
interface Aggregate {
  sum: number;
  count: number;
  orders: Set<string>;
  cellOrders: number;
  overlap: number;
  /**
   * The sum of the items' squares, for their spread (evidence.ts): discounts in basis points and ratings in stars,
   * both whole, or for revenue and average order value, its orders' totals in dollars. Those don't stay whole: a
   * line's revenue is up to about 6e7 millionths, so its square alone nears 2^53, and a float's rounding is far
   * below what a 95% test can tell.
   */
  squares: number;
  /** Lines' orders' revenue so far, in millionths, for their totals' squares; cells add theirs to `squares`. */
  totals: Map<string, number>;
}
/**
 * Results, least recently used out, bounded by count and by their JSON's size with their keys' (each result is at
 * most QUERY_LIMITS.responseBytes; a key, with every playable quarter, about 4 KB; Audit, #247). A five-year save's Investigate load is 11 scans of about 340 ms each (Frank's
 * profile, 2 Nov 2026), so a repeat view is served from here.
 */
const CACHE_LIMITS = { entries: 512, bytes: 16 * 2 ** 20 };
let cacheLimits = { ...CACHE_LIMITS };
const cache = new Map<string, { result: QueryResult; bytes: number }>();
let cachedBytes = 0;
function cached(key: string): QueryResult | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  cache.delete(key);
  cache.set(key, entry);
  return entry.result;
}
function remember(key: string, result: QueryResult, bytes: number) {
  if (bytes > cacheLimits.bytes) return;
  cache.set(key, { result, bytes });
  cachedBytes += bytes;
  for (const [oldest, entry] of cache) {
    if (cache.size <= cacheLimits.entries && cachedBytes <= cacheLimits.bytes) break;
    cache.delete(oldest);
    cachedBytes -= entry.bytes;
  }
}
/** For tests: the cache's size, smaller bounds to exercise it, and a fresh start. */
export const resultCacheSize = () => ({ entries: cache.size, bytes: cachedBytes });
export function setResultCacheLimits(limits: Partial<typeof CACHE_LIMITS> | null) {
  cacheLimits = { ...CACHE_LIMITS, ...limits };
}
export function forgetResults() {
  cache.clear();
  cachedBytes = 0;
}

function bookDimensions(book: DeepReadonly<JoinedBook> | null): Dimensions {
  return {
    genre: book?.info?.genre ?? null,
    series: book?.series?.name ?? null,
    title: book?.title ?? null,
    author: book ? `${book.author.firstName} ${book.author.lastName}` : null,
    awarded: book ? (book.awards.length ? "yes" : "no") : null,
    volume: book?.series && book.info?.volume != null ? String(book.info.volume) : null,
    in_series: book ? (book.series ? "yes" : "no") : null,
  };
}
/**
 * An edition as the player reads it: its title and format, so a title's hardcover and paperback are separate rows.
 * Heliotrope Pajamas has two paperbacks (2181 and 2186), so where a book has two editions in one format, the
 * label adds the publication year.
 */
const editionLabels = new Map<string, string>();
/**
 * An edition's dimensions, as a sale line of it has them (saleFact): its book's, its format, edition, price and
 * publisher. An event about an edition (events.ts) carries these, so a query shows it where the edition's sales are.
 */
export function editionDimensions(
  book: DeepReadonly<JoinedBook>,
  isbn: string,
  publisher: string,
): Dimensions {
  const edition = book.editions.find((e) => e.isbn === isbn);
  if (!edition) throw new Error(`No edition ${isbn} of ${book.title}`);
  return {
    ...bookDimensions(book),
    format: edition.format,
    edition: editionOf({ isbn, format: edition.format, title: book.title, book }),
    list_price: `$${edition.listPrice.toFixed(2)}`,
    price_band: priceBand(edition.listPrice),
    publisher,
  };
}
function editionOf(
  sale: Pick<DeepReadonly<SaleLine>, "isbn" | "format" | "title"> & {
    book: Pick<DeepReadonly<JoinedBook>, "editions">;
  },
): string {
  let label = editionLabels.get(sale.isbn);
  if (label === undefined) {
    const edition = sale.book.editions.find((e) => e.isbn === sale.isbn);
    const twin = sale.book.editions.some((e) => e.isbn !== sale.isbn && e.format === sale.format);
    label = `${sale.title} (${sale.format}${twin && edition ? `, ${edition.publicationDate.slice(0, 4)}` : ""})`;
    editionLabels.set(sale.isbn, label);
  }
  return label;
}
const priceBand = (price: number) =>
  PRICE_BANDS[price < 10 ? 0 : price < 20 ? 1 : price < 30 ? 2 : 3];
/** A book's award names, for the filter-only award dimension: a fact matches if any of them is in the filter. */
const awardsOf = (book: DeepReadonly<JoinedBook> | null): readonly string[] =>
  book?.awards.map((award) => award.name) ?? [];
/**
 * Sums of money and discounts are kept as integers, so they're exact and don't depend on the order lines are added
 * in (docs/design/rollups.md): every list price is whole cents and every discount whole basis points (Sim, #251).
 * A line's revenue is cents x (10,000 - basis points), in millionths of a dollar; a five-year save totals about
 * 2e13 of them, well inside 2^53.
 */
const REVENUE_UNIT = 1e6;
const DISCOUNT_UNIT = 1e4;
function wholeUnits(amount: number, unit: number): number {
  const units = Math.round(amount * unit);
  if (Math.abs(units - amount * unit) > 1e-6)
    throw new QueryError(
      "INVALID_VIEW",
      "A visible sale has a price or discount finer than the ledgers keep.",
    );
  return units;
}
const basisPoints = (discount: number) => wholeUnits(discount, DISCOUNT_UNIT);
const lineRevenue = (listPrice: number, discount: number) =>
  wholeUnits(listPrice, 100) * (DISCOUNT_UNIT - basisPoints(discount));
function saleFact(
  sale: DeepReadonly<SaleLine>,
  measures: readonly Measure[],
  periods: Set<string>,
  simulated: boolean,
): Fact | null {
  if (typeof sale.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(sale.date))
    throw new QueryError("INVALID_VIEW", "A sale has an invalid calendar date.");
  const date = new Date(`${sale.date}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== sale.date)
    throw new QueryError("INVALID_VIEW", "A sale has an invalid calendar date.");
  const quarter = `${sale.date.slice(0, 4)}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
  // Nothing about a hidden sale enters the result, total, provenance, or grouping.
  if (!periods.has(quarter)) return null;
  if (
    !Number.isFinite(sale.listPrice) ||
    !Number.isFinite(sale.discount) ||
    sale.listPrice < 0 ||
    sale.discount < 0 ||
    sale.discount > 1
  )
    throw new QueryError("INVALID_VIEW", "A visible sale has an invalid price or discount.");
  return {
    dimensions: {
      ...bookDimensions(sale.book),
      quarter,
      month: sale.date.slice(0, 7),
      weekday: WEEKDAYS[date.getUTCDay()],
      format: sale.format,
      edition: editionOf(sale),
      list_price: `$${sale.listPrice.toFixed(2)}`,
      price_band: priceBand(sale.listPrice),
      publisher: sale.publisher.name,
      discounted: sale.discount > 0 ? "yes" : "no",
      discount_rate: `${Number((sale.discount * 100).toFixed(8))}%`,
    },
    value: 1,
    ...(measures.some(byOrderTotals)
      ? { revenue: lineRevenue(sale.listPrice, sale.discount) }
      : {}),
    ...(measures.includes("avg_discount") ? { discount: basisPoints(sale.discount) } : {}),
    orderId: sale.orderId,
    simulated,
    awards: awardsOf(sale.book),
  };
}
/** 2193's sale lines, rolled up once per loaded dataset (sale-cells.ts), so a query reads cells, not 56,350 lines. */
const historyCells = new WeakMap<object, SaleCells>();
let historyAsLines = false;
/** For tests: read 2193 line by line, as before the rollups, to compare the two (sale-cells.server.test.ts). */
export function readHistoryAsLines(on: boolean) {
  historyAsLines = on;
}
function historyOf(data: ReturnType<typeof loadBookshop>): SaleCells | null {
  if (historyAsLines) return null;
  let cells = historyCells.get(data);
  if (!cells) historyCells.set(data, (cells = rollUpSales(data.saleLines)));
  return cells;
}

function* facts(query: Query, view: QueryView, history: SaleCells | null): Generator<Fact> {
  const cells: Fact[] = [];
  if (undated(query.measure) && !view.includeUndated)
    throw new QueryError(
      "UNAVAILABLE_FACTS",
      "This view does not allow the undated ratings and checkout snapshot.",
    );
  const data = loadBookshop();
  if (query.measure === "avg_rating" || query.measure === "ratings") {
    // One fact per rating, so a count by stars is one title's histogram and never fans out through editions.
    for (const rating of data.joinedRatings)
      yield {
        dimensions: { ...bookDimensions(rating.book), stars: String(rating.rating) },
        value: query.measure === "ratings" ? 1 : rating.rating,
        awards: awardsOf(rating.book),
      };
  } else if (query.measure === "checkouts") {
    // The checkout snapshot has a month but no year (Checkout.year is null). It came with the 2193 workbook, before
    // any 2194 sale, so its months are 2193's: the same keys as 2193's sales, never mixed with the player's 2194.
    for (const checkout of data.joinedCheckouts)
      yield {
        dimensions: {
          ...bookDimensions(checkout.book),
          month: `2193-${String(checkout.month).padStart(2, "0")}`,
        },
        value: checkout.count,
        awards: awardsOf(checkout.book),
      };
  } else {
    // Every sales measure asked reads the same facts, so one pass serves them all (contract.md, "Several measures").
    const measures = queryMeasures(query);
    const periods = new Set<string>(view.periods);
    if (!history)
      for (const sale of data.saleLines) {
        const fact = saleFact(sale, measures, periods, false);
        if (fact) yield fact;
      }
    for (const sale of view.simulatedSales ?? []) {
      const fact = saleFact(sale, measures, periods, true);
      if (fact) yield fact;
    }
    // Cells are facts for their sample line, weighted by how many lines they hold (sale-cells.ts). 2193's come
    // first, then the save's, numbered on from them, as execute numbers their spanning orders.
    const offset = history?.cells.length ?? 0;
    history?.cells.forEach((cell, at) => {
      const fact = saleFact(cell.line, measures, periods, false);
      if (fact)
        cells.push({
          ...fact,
          weight: cell.lines,
          cell: at,
          orders: cell.orders,
          squares: cell.squares,
        });
    });
    view.simulatedCells?.cells.forEach((cell, at) => {
      const fact = saleFact(cell.line, measures, periods, true);
      if (fact)
        cells.push({
          ...fact,
          weight: cell.lines,
          cell: offset + at,
          orders: cell.orders,
          squares: cell.squares,
        });
    });
    yield* cells;
  }
}
const undated = (measure: Measure) =>
  measure === "avg_rating" || measure === "ratings" || measure === "checkouts";
const aggregate = (): Aggregate => ({
  sum: 0,
  count: 0,
  orders: new Set(),
  cellOrders: 0,
  overlap: 0,
  squares: 0,
  totals: new Map(),
});
/** Measures whose spread is their orders' totals'. */
const byOrderTotals = (measure: Measure) => measure === "revenue" || measure === "avg_order_value";
const orderCount = (target: Aggregate) => target.orders.size + target.cellOrders - target.overlap;
/** A fact's figure for a measure: its revenue, its discount, or its own value. */
const valueOf = (fact: Fact, measure: Measure) =>
  byOrderTotals(measure) ? fact.revenue! : measure === "avg_discount" ? fact.discount! : fact.value;
function add(target: Aggregate, fact: Fact, measure: Measure): void {
  const weight = fact.weight ?? 1;
  const v = valueOf(fact, measure);
  target.sum += v * weight;
  target.count += weight;
  if (measure === "avg_discount" || measure === "avg_rating") target.squares += v * v * weight;
  if (byOrderTotals(measure)) {
    if (fact.cell === undefined)
      target.totals.set(fact.orderId!, (target.totals.get(fact.orderId!) ?? 0) + v);
    else target.squares += fact.squares! * (v / REVENUE_UNIT) ** 2;
  }
  if (!["orders", "revenue", "avg_order_value", "orders_per_day"].includes(measure)) return;
  if (fact.cell === undefined) target.orders.add(fact.orderId!);
  else target.cellOrders += fact.orders!;
}
function value(target: Aggregate, measure: Measure, days = 0): number | null {
  const orders = orderCount(target);
  if (measure === "orders") return orders;
  if (measure === "orders_per_day") return days ? orders / days : null;
  if (measure === "avg_order_value") return orders ? target.sum / REVENUE_UNIT / orders : null;
  if (measure === "avg_discount")
    return target.count ? target.sum / DISCOUNT_UNIT / target.count : null;
  if (measure === "avg_rating") return target.count ? target.sum / target.count : null;
  if (measure === "revenue") return target.sum / REVENUE_UNIT;
  return target.sum;
}
/**
 * How many items a figure is over, and its standard error (evidence.ts). An average's is its items' standard
 * deviation over the root of their count. A count is taken as Poisson, so its own root; revenue as compound
 * Poisson over its orders, so the root of their totals' squares; orders per day as its orders' over its days.
 */
function evidenceOf(target: Aggregate, measure: Measure, days: number): Evidence {
  const orders = orderCount(target);
  const squares =
    target.squares + [...target.totals.values()].reduce((t, v) => t + (v / REVENUE_UNIT) ** 2, 0);
  switch (measure) {
    case "revenue":
      return { n: orders, se: Math.sqrt(squares) };
    case "orders":
      return { n: orders, se: Math.sqrt(orders) };
    case "orders_per_day":
      return { n: days, se: days ? Math.sqrt(orders) / days : null };
    case "checkouts":
      return { n: target.sum, se: Math.sqrt(target.sum) };
    case "units":
    case "ratings":
      return { n: target.count, se: Math.sqrt(target.count) };
  }
  const n = measure === "avg_order_value" ? orders : target.count;
  const mean = value(target, measure);
  if (n < 2 || mean === null) return { n, se: null };
  const scale = measure === "avg_discount" ? DISCOUNT_UNIT ** 2 : 1;
  const variance = Math.max(0, (squares / scale - n * mean * mean) / (n - 1));
  return { n, se: Math.sqrt(variance / n) };
}
function compare(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
  column: Dimension | Measure,
  direction = "asc",
): number {
  if (a == null) return b == null ? 0 : 1;
  if (b == null) return -1;
  const sign = direction === "desc" ? -1 : 1;
  if (column === "weekday")
    return sign * (weekdayOrder.indexOf(String(a)) - weekdayOrder.indexOf(String(b)));
  // Prices sort as amounts ("$8.99" before "$12.50"), and bands in their own order.
  if (column === "list_price")
    return sign * (Number(String(a).slice(1)) - Number(String(b).slice(1)));
  if (column === "price_band")
    return (
      sign *
      ((PRICE_BANDS as readonly string[]).indexOf(String(a)) -
        (PRICE_BANDS as readonly string[]).indexOf(String(b)))
    );
  return sign * (a < b ? -1 : a > b ? 1 : 0);
}
/** Rows in the query's order: by its sort, then by its grouping's values. */
function sortRows(rows: QueryRow[], query: Query): void {
  rows.sort((a, b) => {
    if (query.sort) {
      const compared = compare(
        a[query.sort.column],
        b[query.sort.column],
        query.sort.column,
        query.sort.direction,
      );
      if (compared) return compared;
    }
    for (const column of query.by) {
      const compared = compare(a[column], b[column], column);
      if (compared) return compared;
    }
    return 0;
  });
}
const GRAINS: Record<Measure, string> = {
  revenue: "sale lines",
  units: "sale lines",
  orders: "sale lines",
  avg_discount: "sale lines",
  avg_order_value: "sale lines",
  orders_per_day: "sale lines",
  avg_rating: "ratings",
  ratings: "ratings",
  checkouts: "book/month checkout rows",
};
function calculationOf(measure: Measure, days: number): string {
  return {
    avg_order_value: "sum of revenue / distinct OrderID",
    orders_per_day: `distinct OrderID / eligible calendar days including zero-sale days; total denominator ${days} days; group denominators use only calendar dimensions`,
    revenue: "sum of price × (1 - discount), without per-line rounding, summed exactly",
    units: "one unit per sale line",
    orders: "distinct OrderID; total counted independently of groups",
    avg_discount: "arithmetic mean of sale-line discount fractions",
    avg_rating: "arithmetic mean of individual ratings, joined directly to books",
    checkouts: "sum of Number of Checkouts, joined directly to books",
    ratings: "count of individual ratings, joined directly to books",
  }[measure];
}
/** "Revenue", "Revenue and units", "Revenue, units and orders". */
function measureNames(measures: readonly Measure[]): string {
  const names = measures.map((m, i) => (i ? labels[m].toLowerCase() : labels[m]));
  return names.length < 2 ? names[0]! : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}
/**
 * What a figure or figures were taken from, for the source line: the measures of one grain share its count, and each
 * names its calculation (Plot, contract.md "Several measures"). One measure reads as it always has.
 */
function headOf(measures: readonly Measure[], count: number, days: number): string {
  const calculations =
    measures.length === 1
      ? calculationOf(measures[0]!, days)
      : measures.map((m) => `${labels[m].toLowerCase()}, ${calculationOf(m, days)}`).join("; ");
  return `${measureNames(measures)} from ${count.toLocaleString("en-US")} visible matching ${GRAINS[measures[0]!]}: ${calculations}`;
}
function tailOf(query: Query, filters: number, shown: number, groups: number): string {
  return `${query.by.length ? `; grouped by ${query.by.join(", ")}` : ""}${filters ? `; exact filters on ${Object.keys(query.filter ?? {}).join(", ")}` : ""}. Showing ${shown} of ${groups} groups; total is before the row limit.`;
}
function columnsOf(query: Query): QueryResult["columns"] {
  return [
    ...query.by.map((key) => ({
      key,
      label: labels[key],
      type: "string" as const,
      nullable: ["genre", "series", "title", "author", "awarded", "volume", "in_series"].includes(
        key,
      ),
    })),
    ...queryMeasures(query).map((m) => ({
      key: m,
      label: labels[m],
      type: "number" as const,
      nullable: m.startsWith("avg_") || m === "orders_per_day",
    })),
  ];
}
/** A result's figures for each measure, first first: the first's as `total` and `evidence`, all of them in `measures`. */
function withFigures(
  query: Query,
  figures: { total: number | null; evidence: MeasureEvidence }[],
): Pick<QueryResult, "total" | "evidence" | "measures"> {
  const measures = queryMeasures(query);
  return {
    total: figures[0]!.total,
    evidence: figures[0]!.evidence,
    ...(query.also
      ? { measures: Object.fromEntries(measures.map((m, i) => [m, figures[i]!])) }
      : {}),
  };
}

/**
 * A lookup over one family of facts: sales, or one book-record measure. Every sales measure asked is aggregated in
 * the same pass over the same facts, each in its own aggregate, so each figure is exactly what it would be alone.
 */
function execute(query: Query, view: QueryView): QueryResult {
  return query.also && !isSalesMeasure(query.measure)
    ? lineUp(query, view)
    : aggregateFamily(query, view).result;
}
/** One pass over one family's facts; with how many facts matched, for a source line that lines it up with others. */
function aggregateFamily(query: Query, view: QueryView): { result: QueryResult; count: number } {
  const measures = queryMeasures(query);
  type Group = { dimensions: Dimensions; aggregates: Aggregate[] };
  const fresh = () => measures.map(aggregate);
  const groups = new Map<string, Group>();
  const total = fresh();
  const days = measures.includes("orders_per_day") ? eligibleDays(query, view) : [];
  const denominators = new Map<string, number>();
  const filters = Object.entries(query.filter ?? {}).map(
    ([dimension, values]) => [dimension as Dimension, new Set(values)] as const,
  );
  let simulated = 0;
  const inTotal = new Set<number>();
  const cellGroup = new Map<number, Aggregate[]>();
  const cellRevenue = new Map<number, number>();
  const spread = measures.some(byOrderTotals);
  if (!query.by.length) groups.set("[]", { dimensions: {}, aggregates: fresh() });
  const history = undated(query.measure) ? null : historyOf(loadBookshop());
  for (const fact of facts(query, view, history)) {
    if (
      !filters.every(([dimension, values]) => {
        if (dimension === "award") return fact.awards!.some((award) => values.has(award));
        const v = fact.dimensions[dimension];
        return v != null && values.has(v);
      })
    )
      continue;
    measures.forEach((m, i) => add(total[i]!, fact, m));
    if (fact.simulated) simulated += fact.weight ?? 1;
    if (fact.cell !== undefined) {
      inTotal.add(fact.cell);
      if (spread) cellRevenue.set(fact.cell, fact.revenue!);
    }
    const values = query.by.map((dimension) => fact.dimensions[dimension] ?? null);
    values.forEach(checkLabel);
    const key = JSON.stringify(values);
    let group = groups.get(key);
    if (!group) {
      group = {
        dimensions: Object.fromEntries(query.by.map((dimension, i) => [dimension, values[i]])),
        aggregates: fresh(),
      };
      groups.set(key, group);
    }
    measures.forEach((m, i) => add(group.aggregates[i]!, fact, m));
    if (fact.cell !== undefined) cellGroup.set(fact.cell, group.aggregates);
  }
  // An order spanning several of an aggregate's cells was counted once in each: count it once (sale-cells.ts). Each
  // measure's aggregate counts it; only those that count orders read it.
  const offset = history?.cells.length ?? 0;
  const spanning = [
    ...(history?.spanning ?? []),
    ...(view.simulatedCells?.spanning ?? []).map((touched) => touched.map((at) => offset + at)),
  ];
  const spanningLines = [
    ...(history?.spanningLines ?? []),
    ...(view.simulatedCells?.spanningLines ?? []),
  ];
  spanning.forEach((touched, order) => {
    const seen = new Map<Aggregate[], number>();
    let visible = 0;
    for (const at of touched) {
      if (inTotal.has(at)) visible++;
      const group = cellGroup.get(at);
      if (group) seen.set(group, (seen.get(group) ?? 0) + 1);
    }
    if (visible > 1) for (const a of total) a.overlap += visible - 1;
    for (const [group, count] of seen) if (count > 1) for (const a of group) a.overlap += count - 1;
    if (spread && visible > 1) addCrossTerms(touched, spanningLines[order]!);
  });
  /**
   * An order's total in an aggregate is the sum of its parts in the aggregate's cells. Each cell counted its own
   * part's square, so this adds the rest of the total's square: twice the product of each pair of parts. Only the
   * measures whose spread is their orders' totals keep it.
   */
  function addCrossTerms(touched: readonly number[], lines: readonly number[]) {
    const parts = new Map<Aggregate[], { sum: number; squares: number }>();
    const part = (target: Aggregate[], dollars: number) => {
      const p = parts.get(target) ?? { sum: 0, squares: 0 };
      p.sum += dollars;
      p.squares += dollars * dollars;
      parts.set(target, p);
    };
    touched.forEach((at, i) => {
      const revenue = cellRevenue.get(at);
      if (revenue === undefined) return;
      const dollars = (revenue * lines[i]!) / REVENUE_UNIT;
      part(total, dollars);
      const group = cellGroup.get(at);
      if (group) part(group, dollars);
    });
    for (const [target, p] of parts)
      measures.forEach((m, i) => {
        if (byOrderTotals(m)) target[i]!.squares += p.sum * p.sum - p.squares;
      });
  }
  const evidence = new Map<QueryRow, Evidence[]>();
  const rows: QueryRow[] = [...groups.values()].map((group) => {
    let dayCount = 0;
    if (measures.includes("orders_per_day")) {
      const key = JSON.stringify(
        CALENDAR_DIMENSIONS.map((dimension) => group.dimensions[dimension]),
      );
      dayCount = denominators.get(key) ?? groupDays(days, group.dimensions);
      denominators.set(key, dayCount);
    }
    const row: QueryRow = { ...group.dimensions };
    measures.forEach((m, i) => (row[m] = value(group.aggregates[i]!, m, dayCount)));
    evidence.set(
      row,
      measures.map((m, i) => evidenceOf(group.aggregates[i]!, m, dayCount)),
    );
    return row;
  });
  sortRows(rows, query);
  const visibleRows = rows.slice(0, query.limit ?? QUERY_LIMITS.rows);
  const count = total[0]!.count;
  const scope = undated(query.measure)
    ? "undated source snapshot; no observed year or sales-quarter attribution"
    : `allowed periods: ${[...view.periods].sort().join(", ") || "none"}; ${count - simulated} source and ${simulated} simulated sale lines`;
  const source = `${headOf(measures, count, days.length)}; ${scope}${tailOf(query, filters.length, visibleRows.length, rows.length)}`;
  const result: QueryResult = {
    truncated: visibleRows.length < rows.length,
    columns: columnsOf(query),
    rows: visibleRows,
    source,
    ...withFigures(
      query,
      measures.map((m, i) => ({
        total: value(total[i]!, m, days.length),
        evidence: {
          unit: evidenceUnit(m),
          rows: visibleRows.map((row) => evidence.get(row)![i]!),
          total: evidenceOf(total[i]!, m, days.length),
        },
      })),
    ),
  };
  return { result, count };
}

/**
 * Book-record measures together (ratings, average rating, checkouts): each totalled alone by the grouping, then lined
 * up on the groups' values, never joined fact to fact (contract.md: ratings are never multiplied by sales or each
 * other). A group one measure lacks is a zero for a count and null for an average, with evidence to match.
 */
function lineUp(query: Query, view: QueryView): QueryResult {
  const measures = queryMeasures(query);
  const { also: _also, sort: _sort, limit: _limit, ...base } = query;
  const runs = measures.map((measure) =>
    aggregateFamily({ ...base, measure, limit: Number.MAX_SAFE_INTEGER }, view),
  );
  const alone = runs.map((run) => run.result);
  const keyOf = (row: QueryRow) => JSON.stringify(query.by.map((d) => row[d] ?? null));
  const lined = new Map<string, { row: QueryRow; evidence: Evidence[] }>();
  alone.forEach((result, i) => {
    result.rows.forEach((row, at) => {
      const key = keyOf(row);
      let entry = lined.get(key);
      if (!entry) {
        const dimensions: QueryRow = Object.fromEntries(query.by.map((d) => [d, row[d] ?? null]));
        entry = { row: dimensions, evidence: [] };
        for (const [j, m] of measures.entries()) {
          entry.row[m] = m.startsWith("avg_") ? null : 0;
          entry.evidence[j] = { n: 0, se: m.startsWith("avg_") ? null : 0 };
        }
        lined.set(key, entry);
      }
      entry.row[measures[i]!] = row[measures[i]!] ?? null;
      entry.evidence[i] = result.evidence!.rows[at]!;
    });
  });
  const rows = [...lined.values()].map((e) => e.row);
  sortRows(rows, query);
  const visibleRows = rows.slice(0, query.limit ?? QUERY_LIMITS.rows);
  // The measures of one grain share its count (ratings and their average); each grain is its own clause.
  const heads: string[] = [];
  const done = new Set<Measure>();
  measures.forEach((m, i) => {
    if (done.has(m)) return;
    const same = measures.filter((o) => GRAINS[o] === GRAINS[m]);
    same.forEach((o) => done.add(o));
    const head = headOf(same, runs[i]!.count, 0);
    heads.push(i ? head[0]!.toLowerCase() + head.slice(1) : head);
  });
  const source = `${heads.join("; ")}; undated source snapshot; no observed year or sales-quarter attribution${tailOf(query, Object.keys(query.filter ?? {}).length, visibleRows.length, rows.length)}`;
  return {
    truncated: visibleRows.length < rows.length,
    columns: columnsOf(query),
    rows: visibleRows,
    source,
    ...withFigures(
      query,
      alone.map((result, i) => ({
        total: result.total,
        evidence: {
          unit: result.evidence!.unit,
          rows: visibleRows.map((row) => lined.get(keyOf(row))!.evidence[i]!),
          total: result.evidence!.total,
        },
      })),
    ),
  };
}

/**
 * The query, and with `vs: "last_year"` the same query a year earlier beside it (last-year.ts): each row's figure
 * from the row a year back (its quarter or month a year earlier), and the total's. A figure whose quarters a year
 * back aren't all visible has no last year (null); a group that sold nothing last year is a zero for totals.
 */
function executeWithLastYear(query: Query, view: QueryView): QueryResult {
  const result = execute(query, view);
  if (!query.vs) return result;
  // Every group last year, not just the first 200: a group cut off would read as a zero.
  const before = execute({ ...lastYearQuery(query), limit: Number.MAX_SAFE_INTEGER }, view);
  const groups = new Map(
    before.rows.map((row, i) => [
      JSON.stringify(query.by.map((d) => row[d] ?? null)),
      { row, evidence: before.evidence!.rows[i]! },
    ]),
  );
  // A group that sold nothing last year: a count of zero is sure, an average over nothing has no spread.
  const none: Evidence = { n: 0, se: query.measure.startsWith("avg_") ? null : 0 };
  const evidence: (Evidence | null)[] = [];
  const figure = (row: QueryRow | undefined, missing: string | null, fallback: number | null) =>
    missing ? null : { value: row ? ((row[query.measure] as number | null) ?? null) : fallback };
  const nothing = query.measure.startsWith("avg_") ? null : 0;
  const rows: LastYear[] = result.rows.map((row) => {
    const key = query.by.map((d) => {
      const v = row[d] ?? null;
      return v === null ? null : yearEarlier(d, v);
    });
    const group = groups.get(JSON.stringify(key));
    const missing = lastYearMissing(quartersCovered(query, view.periods, row), view.periods);
    evidence.push(missing ? null : (group?.evidence ?? none));
    return figure(group?.row, missing, nothing);
  });
  const missing = lastYearMissing(quartersCovered(query, view.periods), view.periods);
  const total: LastYear = missing ? null : { value: before.total };
  return {
    ...result,
    lastYear: {
      rows,
      total,
      evidence: { rows: evidence, total: missing ? null : before.evidence!.total },
    },
  };
}

/** Book and edition dimensions an event about an edition answers; a filter on any other one doesn't hide it. */
const EVENT_DIMENSIONS: readonly Dimension[] = [
  "genre",
  "series",
  "title",
  "author",
  "awarded",
  "volume",
  "in_series",
  "format",
  "edition",
  "list_price",
  "price_band",
  "publisher",
];

/**
 * The view's events a result over months or quarters marks (events.ts), with how many were left out. One is in
 * scope when its quarter (and, for a day or month, its month) is one the query covers. One about an edition also
 * needs the edition to pass the query's filters on its own dimensions, and, broken down by one of them as well, to
 * be among the result's groups: the release shows on the whole shop and on Mystery, not on Romance. A shop-wide
 * move shows everywhere it's in scope. Past MAX_EVENTS, the latest of the highest-ranked kinds are kept.
 */
function eventsFor(query: Query, view: QueryView, result: QueryResult): QueryResult["events"] {
  if (!query.by.some((d) => d === "month" || d === "quarter")) return undefined;
  // A time series always says what it marks, if only that there's nothing: a view with no events gives an empty list.
  if (!view.events?.length) return { list: [], hidden: 0 };
  const quarters = new Set(quartersCovered(query, view.periods));
  const months = query.filter?.month;
  const filters = Object.entries(query.filter ?? {}) as [Dimension, readonly string[]][];
  const grouped = query.by.filter((d) => EVENT_DIMENSIONS.includes(d));
  // An event about an edition whose group a row limit cut isn't drawn, but it's counted (Audit, #353).
  let cut = 0;
  const inScope = (event: ViewEvent) => {
    if (!quarters.has(quarterOfDate(event.date))) return false;
    if (months && event.precision !== "quarter" && !months.includes(event.date.slice(0, 7)))
      return false;
    if (!event.dimensions) return true;
    const dims = event.dimensions;
    const passes = filters.every(([d, values]) =>
      d === "award"
        ? (event.awards ?? []).some((a) => values.includes(a))
        : !EVENT_DIMENSIONS.includes(d) || (dims[d] != null && values.includes(dims[d]!)),
    );
    if (!passes) return false;
    if (grouped.every((d) => result.rows.some((row) => row[d] === dims[d]))) return true;
    if (result.truncated) cut++;
    return false;
  };
  const relevant = view.events.filter(inScope);
  const kept = [...relevant]
    .sort((a, b) => EVENT_RANK[a.kind] - EVENT_RANK[b.kind] || b.date.localeCompare(a.date))
    .slice(0, MAX_EVENTS)
    .sort(byDate);
  return {
    list: kept.map(({ date, precision, kind, label, dimensions }) => {
      const group = Object.fromEntries(
        grouped.flatMap((d) => (dimensions?.[d] != null ? [[d, dimensions[d]!]] : [])),
      );
      return {
        date,
        precision,
        kind,
        label,
        ...(Object.keys(group).length ? { group } : {}),
      };
    }),
    hidden: relevant.length - kept.length + cut,
  };
}

/** A view's events as a short hash for the cache key, worked out once per list. */
const eventHashes = new WeakMap<readonly ViewEvent[], string>();
function eventsKey(events: readonly ViewEvent[] | undefined): string | null {
  if (!events?.length) return null;
  let hash = eventHashes.get(events);
  if (!hash) {
    hash = createHash("sha256").update(JSON.stringify(events)).digest("hex").slice(0, 16);
    eventHashes.set(events, hash);
  }
  return hash;
}

/** Fixed grammar only. Visibility always comes from trusted server state. */
export function runQuery(
  input: unknown,
  view: QueryView,
  track: QueryTrack = trackQuery,
): QueryResult {
  const started = performance.now();
  let query: Query | undefined;
  try {
    query = validateQuery(input);
    validateView(view);
    // History is immutable per build. Simulated lines and cells are cached only under the save's data version, which the
    // server sets with them and which changes with every played quarter, new game and reset. The key includes the
    // ENTIRE visibility grant.
    const key =
      (view.simulatedSales?.length || view.simulatedCells) && !view.version
        ? null
        : JSON.stringify([
            query,
            [...view.periods].sort(),
            view.includeUndated,
            view.version ?? null,
            // The events a result marks come from the view too (events.ts).
            eventsKey(view.events),
          ]);
    let result = key ? cached(key) : undefined;
    const cacheHit = result !== undefined;
    if (!result) {
      // Relative quarters resolved against what the player can see, then run, compared and cached as dated ones
      // (relative.ts). The key keeps the token: with the periods in it, it names the same resolution.
      const { query: run, resolved } = resolveQuery(query, view.periods);
      result = executeWithLastYear(run, view);
      if (resolved) result = { ...result, resolved };
      // Marked on the quarters the tokens resolved to, as the rows are (Frank, #378).
      const events = eventsFor(run, view, result);
      if (events) result = { ...result, events };
      const body = serializeResult(result);
      if (key) remember(key, result, body.length + key.length);
    }
    emit(track, "query_completed", {
      measure: query.measure,
      // How many measures, and which, from the fixed list: never a value or a row.
      measureCount: queryMeasures(query).length,
      measures: queryMeasures(query).join(","),
      dimensionCount: query.by.length,
      rowCount: result.rows.length,
      durationMs: performance.now() - started,
      cacheHit,
    });
    return structuredClone(result);
  } catch (error) {
    emit(track, "query_failed", {
      measure: query?.measure ?? "invalid",
      measureCount: query ? queryMeasures(query).length : 0,
      measures: query ? queryMeasures(query).join(",") : "invalid",
      dimensionCount: query?.by.length ?? 0,
      rowCount: 0,
      durationMs: performance.now() - started,
      code: error instanceof QueryError ? error.code : "INTERNAL_ERROR",
    });
    throw error;
  }
}
