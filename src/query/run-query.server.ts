import { loadBookshop } from '../bookshop/loader.server';
import type { DeepReadonly, JoinedBook, SaleLine } from '../bookshop/types';
import { QueryError } from './errors';
import { validateQuery } from './validate';
import { validateView } from './view.server';
import { emit, trackQuery } from './telemetry.server';
import { eligibleDays, groupDays, CALENDAR_DIMENSIONS, WEEKDAYS } from './calendar';
import { checkLabel, serializeResult } from './result';
import { PRICE_BANDS, QUERY_LIMITS } from './types';
import { rollUpSales, type SaleCells } from './sale-cells';
import type { Dimension, Measure, Query, QueryResult, QueryRow, QueryTrack, QueryView } from './types';

const labels: Record<Dimension | Measure, string> = {
  quarter: 'Quarter', month: 'Month', weekday: 'Weekday', genre: 'Genre', format: 'Format', publisher: 'Publisher', series: 'Series', title: 'Title', author: 'Author', discounted: 'Discounted', discount_rate: 'Discount rate', stars: 'Stars', awarded: 'Award winner', award: 'Award', volume: 'Volume', in_series: 'In a series', edition: 'Edition', list_price: 'List price', price_band: 'Price band',
  revenue: 'Revenue', units: 'Units', orders: 'Orders', avg_discount: 'Average discount', avg_rating: 'Average rating', checkouts: 'Checkouts', avg_order_value: 'Average order value', orders_per_day: 'Orders per day', ratings: 'Ratings',
};
const weekdayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
type Dimensions = Partial<Record<Dimension, string | null>>;
/** A fact from a sale cell (sale-cells.ts) stands for `weight` lines, with `orders` distinct orders among them. */
interface Fact { dimensions: Dimensions; value: number; orderId?: string; simulated?: boolean; awards?: readonly string[]; weight?: number; cell?: number; orders?: number }
/**
 * Distinct orders: those of lines in a set, plus those of cells as counted, less the orders counted in more than one
 * of the aggregate's cells (`overlap`), so an order spanning cells is counted once.
 */
interface Aggregate { sum: number; count: number; orders: Set<string>; cellOrders: number; overlap: number }
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
  cache.delete(key); cache.set(key, entry);
  return entry.result;
}
function remember(key: string, result: QueryResult, bytes: number) {
  if (bytes > cacheLimits.bytes) return;
  cache.set(key, { result, bytes }); cachedBytes += bytes;
  for (const [oldest, entry] of cache) {
    if (cache.size <= cacheLimits.entries && cachedBytes <= cacheLimits.bytes) break;
    cache.delete(oldest); cachedBytes -= entry.bytes;
  }
}
/** For tests: the cache's size, smaller bounds to exercise it, and a fresh start. */
export const resultCacheSize = () => ({ entries: cache.size, bytes: cachedBytes });
export function setResultCacheLimits(limits: Partial<typeof CACHE_LIMITS> | null) { cacheLimits = { ...CACHE_LIMITS, ...limits }; }
export function forgetResults() { cache.clear(); cachedBytes = 0; }

function bookDimensions(book: DeepReadonly<JoinedBook> | null): Dimensions {
  return { genre: book?.info?.genre ?? null, series: book?.series?.name ?? null, title: book?.title ?? null,
    author: book ? `${book.author.firstName} ${book.author.lastName}` : null, awarded: book ? (book.awards.length ? 'yes' : 'no') : null,
    volume: book?.series && book.info?.volume != null ? String(book.info.volume) : null, in_series: book ? (book.series ? 'yes' : 'no') : null };
}
/**
 * An edition as the player reads it: its title and format, so a title's hardcover and paperback are separate rows.
 * Heliotrope Pajamas has two paperbacks (2181 and 2186), so where a book has two editions in one format, the
 * label adds the publication year.
 */
const editionLabels = new Map<string, string>();
function editionOf(sale: DeepReadonly<SaleLine>): string {
  let label = editionLabels.get(sale.isbn);
  if (label === undefined) {
    const edition = sale.book.editions.find(e => e.isbn === sale.isbn);
    const twin = sale.book.editions.some(e => e.isbn !== sale.isbn && e.format === sale.format);
    label = `${sale.title} (${sale.format}${twin && edition ? `, ${edition.publicationDate.slice(0, 4)}` : ''})`;
    editionLabels.set(sale.isbn, label);
  }
  return label;
}
const priceBand = (price: number) => PRICE_BANDS[price < 10 ? 0 : price < 20 ? 1 : price < 30 ? 2 : 3];
/** A book's award names, for the filter-only award dimension: a fact matches if any of them is in the filter. */
const awardsOf = (book: DeepReadonly<JoinedBook> | null): readonly string[] => book?.awards.map(award => award.name) ?? [];
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
  if (Math.abs(units - amount * unit) > 1e-6) throw new QueryError('INVALID_VIEW', 'A visible sale has a price or discount finer than the ledgers keep.');
  return units;
}
const basisPoints = (discount: number) => wholeUnits(discount, DISCOUNT_UNIT);
const lineRevenue = (listPrice: number, discount: number) => wholeUnits(listPrice, 100) * (DISCOUNT_UNIT - basisPoints(discount));
function saleFact(sale: DeepReadonly<SaleLine>, measure: Measure, periods: Set<string>, simulated: boolean): Fact | null {
  if (typeof sale.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(sale.date)) throw new QueryError('INVALID_VIEW', 'A sale has an invalid calendar date.');
  const date = new Date(`${sale.date}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== sale.date) throw new QueryError('INVALID_VIEW', 'A sale has an invalid calendar date.');
  const quarter = `${sale.date.slice(0, 4)}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
  // Nothing about a hidden sale enters the result, total, provenance, or grouping.
  if (!periods.has(quarter)) return null;
  if (!Number.isFinite(sale.listPrice) || !Number.isFinite(sale.discount) || sale.listPrice < 0 || sale.discount < 0 || sale.discount > 1) throw new QueryError('INVALID_VIEW', 'A visible sale has an invalid price or discount.');
  return { dimensions: { ...bookDimensions(sale.book), quarter, month: sale.date.slice(0, 7), weekday: WEEKDAYS[date.getUTCDay()],
    format: sale.format, edition: editionOf(sale), list_price: `$${sale.listPrice.toFixed(2)}`, price_band: priceBand(sale.listPrice),
    publisher: sale.publisher.name, discounted: sale.discount > 0 ? 'yes' : 'no', discount_rate: `${Number((sale.discount * 100).toFixed(8))}%` },
    value: (measure === 'revenue' || measure === 'avg_order_value') ? lineRevenue(sale.listPrice, sale.discount) : measure === 'avg_discount' ? basisPoints(sale.discount) : 1,
    orderId: sale.orderId, simulated, awards: awardsOf(sale.book) };
}
/** 2193's sale lines, rolled up once per loaded dataset (sale-cells.ts), so a query reads cells, not 56,350 lines. */
const historyCells = new WeakMap<object, SaleCells>();
let historyAsLines = false;
/** For tests: read 2193 line by line, as before the rollups, to compare the two (sale-cells.server.test.ts). */
export function readHistoryAsLines(on: boolean) { historyAsLines = on; }
function historyOf(data: ReturnType<typeof loadBookshop>): SaleCells | null {
  if (historyAsLines) return null;
  let cells = historyCells.get(data);
  if (!cells) historyCells.set(data, (cells = rollUpSales(data.saleLines)));
  return cells;
}

function* facts(query: Query, view: QueryView, history: SaleCells | null): Generator<Fact> {
  const cells: Fact[] = [];
  if (undated(query.measure) && !view.includeUndated) throw new QueryError('UNAVAILABLE_FACTS', 'This view does not allow the undated ratings and checkout snapshot.');
  const data = loadBookshop();
  if (query.measure === 'avg_rating' || query.measure === 'ratings') {
    // One fact per rating, so a count by stars is one title's histogram and never fans out through editions.
    for (const rating of data.joinedRatings) yield { dimensions: { ...bookDimensions(rating.book), stars: String(rating.rating) }, value: query.measure === 'ratings' ? 1 : rating.rating, awards: awardsOf(rating.book) };
  } else if (query.measure === 'checkouts') {
    // The checkout snapshot has a month but no year (Checkout.year is null). It came with the 2193 workbook, before
    // any 2194 sale, so its months are 2193's: the same keys as 2193's sales, never mixed with the player's 2194.
    for (const checkout of data.joinedCheckouts) yield { dimensions: { ...bookDimensions(checkout.book), month: `2193-${String(checkout.month).padStart(2, '0')}` }, value: checkout.count, awards: awardsOf(checkout.book) };
  } else {
    const periods = new Set<string>(view.periods);
    if (!history) for (const sale of data.saleLines) { const fact = saleFact(sale, query.measure, periods, false); if (fact) yield fact; }
    for (const sale of view.simulatedSales ?? []) { const fact = saleFact(sale, query.measure, periods, true); if (fact) yield fact; }
    // Cells are facts for their sample line, weighted by how many lines they hold (sale-cells.ts). 2193's come
    // first, then the save's, numbered on from them, as execute numbers their spanning orders.
    const offset = history?.cells.length ?? 0;
    history?.cells.forEach((cell, at) => {
      const fact = saleFact(cell.line, query.measure, periods, false);
      if (fact) cells.push({ ...fact, weight: cell.lines, cell: at, orders: cell.orders });
    });
    view.simulatedCells?.cells.forEach((cell, at) => {
      const fact = saleFact(cell.line, query.measure, periods, true);
      if (fact) cells.push({ ...fact, weight: cell.lines, cell: offset + at, orders: cell.orders });
    });
    yield* cells;
  }
}
const undated = (measure: Measure) => measure === 'avg_rating' || measure === 'ratings' || measure === 'checkouts';
const aggregate = (): Aggregate => ({ sum: 0, count: 0, orders: new Set(), cellOrders: 0, overlap: 0 });
const orderCount = (target: Aggregate) => target.orders.size + target.cellOrders - target.overlap;
function add(target: Aggregate, fact: Fact, measure: Measure): void {
  const weight = fact.weight ?? 1;
  target.sum += fact.value * weight;
  target.count += weight;
  if (!['orders', 'avg_order_value', 'orders_per_day'].includes(measure)) return;
  if (fact.cell === undefined) target.orders.add(fact.orderId!);
  else target.cellOrders += fact.orders!;
}
function value(target: Aggregate, measure: Measure, days = 0): number | null {
  const orders = orderCount(target);
  if (measure === 'orders') return orders;
  if (measure === 'orders_per_day') return days ? orders / days : null;
  if (measure === 'avg_order_value') return orders ? target.sum / REVENUE_UNIT / orders : null;
  if (measure === 'avg_discount') return target.count ? target.sum / DISCOUNT_UNIT / target.count : null;
  if (measure === 'avg_rating') return target.count ? target.sum / target.count : null;
  if (measure === 'revenue') return target.sum / REVENUE_UNIT;
  return target.sum;
}
function compare(a: string | number | null | undefined, b: string | number | null | undefined, column: Dimension | Measure, direction = 'asc'): number {
  if (a == null) return b == null ? 0 : 1;
  if (b == null) return -1;
  const sign = direction === 'desc' ? -1 : 1;
  if (column === 'weekday') return sign * (weekdayOrder.indexOf(String(a)) - weekdayOrder.indexOf(String(b)));
  // Prices sort as amounts ("$8.99" before "$12.50"), and bands in their own order.
  if (column === 'list_price') return sign * (Number(String(a).slice(1)) - Number(String(b).slice(1)));
  if (column === 'price_band') return sign * ((PRICE_BANDS as readonly string[]).indexOf(String(a)) - (PRICE_BANDS as readonly string[]).indexOf(String(b)));
  return sign * (a < b ? -1 : a > b ? 1 : 0);
}
function execute(query: Query, view: QueryView): QueryResult {
  const groups = new Map<string, { dimensions: Dimensions; aggregate: Aggregate }>();
  const total = aggregate();
  const days = query.measure === 'orders_per_day' ? eligibleDays(query, view) : [];
  const denominators = new Map<string, number>();
  const filters = Object.entries(query.filter ?? {}).map(([dimension, values]) => [dimension as Dimension, new Set(values)] as const);
  let simulated = 0;
  const inTotal = new Set<number>();
  const cellGroup = new Map<number, Aggregate>();
  if (!query.by.length) groups.set('[]', { dimensions: {}, aggregate: aggregate() });
  const history = undated(query.measure) ? null : historyOf(loadBookshop());
  for (const fact of facts(query, view, history)) {
    if (!filters.every(([dimension, values]) => {
      if (dimension === 'award') return fact.awards!.some(award => values.has(award));
      const v = fact.dimensions[dimension]; return v != null && values.has(v);
    })) continue;
    add(total, fact, query.measure);
    if (fact.simulated) simulated += fact.weight ?? 1;
    if (fact.cell !== undefined) inTotal.add(fact.cell);
    const values = query.by.map(dimension => fact.dimensions[dimension] ?? null);
    values.forEach(checkLabel);
    const key = JSON.stringify(values);
    let group = groups.get(key);
    if (!group) { group = { dimensions: Object.fromEntries(query.by.map((dimension, i) => [dimension, values[i]])), aggregate: aggregate() }; groups.set(key, group); }
    add(group.aggregate, fact, query.measure);
    if (fact.cell !== undefined) cellGroup.set(fact.cell, group.aggregate);
  }
  // An order spanning several of an aggregate's cells was counted once in each: count it once (sale-cells.ts).
  const offset = history?.cells.length ?? 0;
  const spanning = [...(history?.spanning ?? []), ...(view.simulatedCells?.spanning ?? []).map(touched => touched.map(at => offset + at))];
  for (const touched of spanning) {
    const seen = new Map<Aggregate, number>();
    let visible = 0;
    for (const at of touched) {
      if (inTotal.has(at)) visible++;
      const group = cellGroup.get(at);
      if (group) seen.set(group, (seen.get(group) ?? 0) + 1);
    }
    if (visible > 1) total.overlap += visible - 1;
    for (const [group, count] of seen) if (count > 1) group.overlap += count - 1;
  }
  const rows: QueryRow[] = [...groups.values()].map(group => {
    let dayCount = 0;
    if (query.measure === 'orders_per_day') {
      const key = JSON.stringify(CALENDAR_DIMENSIONS.map(dimension => group.dimensions[dimension]));
      dayCount = denominators.get(key) ?? groupDays(days, group.dimensions);
      denominators.set(key, dayCount);
    }
    return { ...group.dimensions, [query.measure]: value(group.aggregate, query.measure, dayCount) };
  });
  rows.sort((a, b) => {
    if (query.sort) { const compared = compare(a[query.sort.column], b[query.sort.column], query.sort.column, query.sort.direction); if (compared) return compared; }
    for (const column of query.by) { const compared = compare(a[column], b[column], column); if (compared) return compared; }
    return 0;
  });
  const visibleRows = rows.slice(0, query.limit ?? QUERY_LIMITS.rows);
  const grain = query.measure === 'avg_rating' || query.measure === 'ratings' ? 'ratings' : query.measure === 'checkouts' ? 'book/month checkout rows' : 'sale lines';
  const calculation = { avg_order_value: 'sum of revenue / distinct OrderID', orders_per_day: `distinct OrderID / eligible calendar days including zero-sale days; total denominator ${days.length} days; group denominators use only calendar dimensions`, revenue: 'sum of price × (1 - discount), without per-line rounding, summed exactly', units: 'one unit per sale line', orders: 'distinct OrderID; total counted independently of groups', avg_discount: 'arithmetic mean of sale-line discount fractions', avg_rating: 'arithmetic mean of individual ratings, joined directly to books', checkouts: 'sum of Number of Checkouts, joined directly to books', ratings: 'count of individual ratings, joined directly to books' }[query.measure];
  const scope = undated(query.measure) ? 'undated source snapshot; no observed year or sales-quarter attribution' : `allowed periods: ${[...view.periods].sort().join(', ') || 'none'}; ${total.count - simulated} source and ${simulated} simulated sale lines`;
  const source = `${labels[query.measure]} from ${total.count.toLocaleString('en-US')} visible matching ${grain}: ${calculation}; ${scope}${query.by.length ? `; grouped by ${query.by.join(', ')}` : ''}${filters.length ? `; exact filters on ${filters.map(([dimension]) => dimension).join(', ')}` : ''}. Showing ${visibleRows.length} of ${rows.length} groups; total is before the row limit.`;
  return { truncated: visibleRows.length < rows.length, columns: [...query.by.map(key => ({ key, label: labels[key], type: 'string' as const, nullable: ['genre', 'series', 'title', 'author', 'awarded', 'volume', 'in_series'].includes(key) })),
    { key: query.measure, label: labels[query.measure], type: 'number', nullable: query.measure.startsWith('avg_') || query.measure === 'orders_per_day' }], rows: visibleRows, total: value(total, query.measure, days.length), source };
}

/** Fixed grammar only. Visibility always comes from trusted server state. */
export function runQuery(input: unknown, view: QueryView, track: QueryTrack = trackQuery): QueryResult {
  const started = performance.now();
  let query: Query | undefined;
  try {
    query = validateQuery(input);
    validateView(view);
    // History is immutable per build. Simulated lines and cells are cached only under the save's data version, which the
    // server sets with them and which changes with every played quarter, new game and reset. The key includes the
    // ENTIRE visibility grant.
    const key = (view.simulatedSales?.length || view.simulatedCells) && !view.version ? null : JSON.stringify([query, [...view.periods].sort(), view.includeUndated, view.version ?? null]);
    let result = key ? cached(key) : undefined;
    const cacheHit = result !== undefined;
    if (!result) {
      result = execute(query, view);
      const body = serializeResult(result);
      if (key) remember(key, result, body.length + key.length);
    }
    emit(track, 'query_completed', { measure: query.measure, dimensionCount: query.by.length, rowCount: result.rows.length, durationMs: performance.now() - started, cacheHit });
    return structuredClone(result);
  } catch (error) {
    emit(track, 'query_failed', { measure: query?.measure ?? 'invalid', dimensionCount: query?.by.length ?? 0, rowCount: 0, durationMs: performance.now() - started, code: error instanceof QueryError ? error.code : 'INTERNAL_ERROR' });
    throw error;
  }
}
