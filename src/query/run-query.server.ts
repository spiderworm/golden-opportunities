import { loadBookshop } from '../bookshop/loader.server';
import type { DeepReadonly, JoinedBook, SaleLine } from '../bookshop/types';
import { QueryError } from './errors';
import { validateQuery } from './validate';
import { validateView } from './view.server';
import { emit, trackQuery } from './telemetry.server';
import { eligibleDays, groupDays, CALENDAR_DIMENSIONS, WEEKDAYS } from './calendar';
import { checkLabel, serializeResult } from './result';
import { PRICE_BANDS, QUERY_LIMITS } from './types';
import type { Dimension, Measure, Query, QueryResult, QueryRow, QueryTrack, QueryView } from './types';

const labels: Record<Dimension | Measure, string> = {
  quarter: 'Quarter', month: 'Month', weekday: 'Weekday', genre: 'Genre', format: 'Format', publisher: 'Publisher', series: 'Series', title: 'Title', author: 'Author', discounted: 'Discounted', discount_rate: 'Discount rate', stars: 'Stars', awarded: 'Award winner', award: 'Award', volume: 'Volume', in_series: 'In a series', edition: 'Edition', list_price: 'List price', price_band: 'Price band',
  revenue: 'Revenue', units: 'Units', orders: 'Orders', avg_discount: 'Average discount', avg_rating: 'Average rating', checkouts: 'Checkouts', avg_order_value: 'Average order value', orders_per_day: 'Orders per day', ratings: 'Ratings',
};
const weekdayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
type Dimensions = Partial<Record<Dimension, string | null>>;
interface Fact { dimensions: Dimensions; value: number; orderId?: string; simulated?: boolean; awards?: readonly string[] }
interface Aggregate { sum: number; count: number; orders: Set<string> }
const cache = new Map<string, QueryResult>();

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
    value: (measure === 'revenue' || measure === 'avg_order_value') ? sale.listPrice * (1 - sale.discount) : measure === 'avg_discount' ? sale.discount : 1,
    orderId: sale.orderId, simulated, awards: awardsOf(sale.book) };
}
function* facts(query: Query, view: QueryView): Generator<Fact> {
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
    for (const sale of data.saleLines) { const fact = saleFact(sale, query.measure, periods, false); if (fact) yield fact; }
    for (const sale of view.simulatedSales ?? []) { const fact = saleFact(sale, query.measure, periods, true); if (fact) yield fact; }
  }
}
const undated = (measure: Measure) => measure === 'avg_rating' || measure === 'ratings' || measure === 'checkouts';
const aggregate = (): Aggregate => ({ sum: 0, count: 0, orders: new Set() });
function add(target: Aggregate, fact: Fact, measure: Measure): void {
  target.sum += fact.value;
  target.count++;
  if (['orders', 'avg_order_value', 'orders_per_day'].includes(measure)) target.orders.add(fact.orderId!);
}
function value(target: Aggregate, measure: Measure, days = 0): number | null {
  if (measure === 'orders') return target.orders.size;
  if (measure === 'orders_per_day') return days ? target.orders.size / days : null;
  if (measure === 'avg_order_value') return target.orders.size ? target.sum / target.orders.size : null;
  if (measure === 'avg_discount' || measure === 'avg_rating') return target.count ? target.sum / target.count : null;
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
  if (!query.by.length) groups.set('[]', { dimensions: {}, aggregate: aggregate() });
  for (const fact of facts(query, view)) {
    if (!filters.every(([dimension, values]) => {
      if (dimension === 'award') return fact.awards!.some(award => values.has(award));
      const v = fact.dimensions[dimension]; return v != null && values.has(v);
    })) continue;
    add(total, fact, query.measure);
    if (fact.simulated) simulated++;
    const values = query.by.map(dimension => fact.dimensions[dimension] ?? null);
    values.forEach(checkLabel);
    const key = JSON.stringify(values);
    let group = groups.get(key);
    if (!group) { group = { dimensions: Object.fromEntries(query.by.map((dimension, i) => [dimension, values[i]])), aggregate: aggregate() }; groups.set(key, group); }
    add(group.aggregate, fact, query.measure);
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
  const calculation = { avg_order_value: 'sum of revenue / distinct OrderID', orders_per_day: `distinct OrderID / eligible calendar days including zero-sale days; total denominator ${days.length} days; group denominators use only calendar dimensions`, revenue: 'sum of price × (1 - discount), without per-line rounding', units: 'one unit per sale line', orders: 'distinct OrderID; total counted independently of groups', avg_discount: 'arithmetic mean of sale-line discount fractions', avg_rating: 'arithmetic mean of individual ratings, joined directly to books', checkouts: 'sum of Number of Checkouts, joined directly to books', ratings: 'count of individual ratings, joined directly to books' }[query.measure];
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
    // History is immutable per build. Simulated arrays have no version contract yet,
    // so never cache them. The history key includes the ENTIRE visibility grant.
    const key = view.simulatedSales?.length ? null : JSON.stringify([query, [...view.periods].sort(), view.includeUndated]);
    let result = key ? cache.get(key) : undefined;
    const cacheHit = result !== undefined;
    if (!result) {
      result = execute(query, view);
      serializeResult(result);
      if (key) { if (cache.size >= 64) cache.delete(cache.keys().next().value!); cache.set(key, result); }
    }
    emit(track, 'query_completed', { measure: query.measure, dimensionCount: query.by.length, rowCount: result.rows.length, durationMs: performance.now() - started, cacheHit });
    return structuredClone(result);
  } catch (error) {
    emit(track, 'query_failed', { measure: query?.measure ?? 'invalid', dimensionCount: query?.by.length ?? 0, rowCount: 0, durationMs: performance.now() - started, code: error instanceof QueryError ? error.code : 'INTERNAL_ERROR' });
    throw error;
  }
}
