import { describe, expect, it, vi } from 'vitest';
import { loadBookshop } from '../bookshop/loader.server';
import type { DeepReadonly, SaleLine } from '../bookshop/types';
import { runQuery } from './run-query.server';
import { BASELINE_VIEW } from './view.server';
import type { Query, QueryView } from './types';

const quiet = () => {};
const run = (query: Query, view: QueryView = BASELINE_VIEW) => runQuery(query, view, quiet);
const q1: QueryView = { periods: ['2193-Q1'], includeUndated: false };
const empty: QueryView = { periods: [], includeUndated: false };
const template = loadBookshop().saleLines[0];
function sale(patch: Partial<DeepReadonly<SaleLine>> = {}): DeepReadonly<SaleLine> {
  return { ...template, id: 'sim:1', orderId: 'sim-order:1', date: '2194-01-02', listPrice: 20, discount: 0.15, revenue: 999, ...patch };
}

describe('querying the source at its actual fact grain', () => {
  it('reconciles Q1–Q4 and global revenue with player-visible provenance', () => {
    const result = run({ measure: 'revenue', by: ['quarter'] });
    expect(result.rows.map(row => row.quarter)).toEqual(['2193-Q1', '2193-Q2', '2193-Q3', '2193-Q4']);
    [95245.8078, 164436.9438, 274036.165, 161524.6946].forEach((value, i) => expect(result.rows[i].revenue).toBeCloseTo(value, 4));
    expect(result.total).toBeCloseTo(695243.6112, 4);
    expect(result.source).toContain('56,350 visible matching sale lines');
    expect(result.source).toContain('price × (1 - discount)');
    expect(result.columns.map(column => column.key)).toEqual(['quarter', 'revenue']);
  });
  it('computes distinct orders, weighted totals, and independent non-sale facts', () => {
    expect(run({ measure: 'units', by: [] }).total).toBe(56350);
    expect(run({ measure: 'orders', by: [] }).total).toBe(49514);
    expect(run({ measure: 'avg_discount', by: ['genre'], limit: 1 }).total).toBeCloseTo(0.005573913043478328, 10);
    expect(run({ measure: 'avg_order_value', by: [] }).total).toBeCloseTo(695243.6112 / 49514, 8);
    const ratings = run({ measure: 'avg_rating', by: ['title'] });
    expect(ratings.total).toBeCloseTo(4.118656864693026, 10);
    expect(ratings.rows.some(row => row.title === null && typeof row.avg_rating === 'number')).toBe(true);
    expect(ratings.source).toContain('50,330 visible matching ratings');
    expect(ratings.source).toContain('no observed year');
    const checkouts = run({ measure: 'checkouts', by: ['month'] });
    expect(checkouts.total).toBe(13533);
    expect(checkouts.rows.map(row => row.month)).toEqual(Array.from({ length: 12 }, (_, i) => `2193-${String(i + 1).padStart(2, '0')}`));
    expect(checkouts.source).toContain('668 visible matching book/month checkout rows');
  });
  it('filters exact discount rates and retains an independent total before top-N', () => {
    const rates = run({ measure: 'units', by: ['discount_rate'] });
    expect(new Set(rates.rows.map(row => row.discount_rate))).toEqual(new Set(['0%', '5%', '10%', '13%', '15%', '20%']));
    const limited = run({ measure: 'revenue', by: ['quarter'], sort: { column: 'revenue', direction: 'desc' }, limit: 1 });
    expect(limited.rows[0].quarter).toBe('2193-Q3');
    expect(limited.total).toBeCloseTo(695243.6112, 4);
    expect(limited.source).toContain('Showing 1 of 4 groups');
    const result = run({ measure: 'units', by: ['discount_rate', 'month'], filter: { discount_rate: ['15%'], month: ['2193-01', '2193-02'] } });
    expect(result.rows).toHaveLength(2);
    expect(result.rows.every(row => row.discount_rate === '15%' && ['2193-01', '2193-02'].includes(row.month!))).toBe(true);
  });
  it('uses calendar exposure, including zero-sale days, for daily order comparisons', () => {
    expect(run({ measure: 'orders_per_day', by: [] }, q1).total).toBeCloseTo(6825 / 90, 10);
    expect(run({ measure: 'orders_per_day', by: [] }).total).toBeCloseTo(49514 / 365, 10);
    const counts = run({ measure: 'orders', by: ['weekday'] });
    const daily = run({ measure: 'orders_per_day', by: ['weekday'] });
    expect(daily.rows.map(row => row.weekday)).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
    [52, 53, 52, 52, 52, 52, 52].forEach((days, i) => expect(daily.rows[i].orders_per_day).toBeCloseTo(counts.rows[i].orders! / days, 10));
    expect(run({ measure: 'orders_per_day', by: [], filter: { title: ['No matching book'] } }, q1).total).toBe(0);
    expect(run({ measure: 'orders_per_day', by: [], filter: { quarter: ['2193-Q4'] } }, q1).total).toBeNull();
    expect(run({ measure: 'orders_per_day', by: [], filter: { month: ['2193-02'] } }, q1).source).toContain('28 days');
  });
  it('counts an order spanning groups once globally, with revenue per order computed independently', () => {
    const view: QueryView = { periods: ['2194-Q1'], includeUndated: false, simulatedSales: [sale({ format: 'Hardcover' }), sale({ id: 'sim:2', format: 'Paperback' })] };
    const orders = run({ measure: 'orders', by: ['format'] }, view);
    expect(orders.rows.map(row => row.orders)).toEqual([1, 1]);
    expect(orders.total).toBe(1);
    expect(run({ measure: 'avg_order_value', by: ['format'] }, view).total).toBe(34);
    expect(run({ measure: 'orders_per_day', by: ['format'] }, view).total).toBeCloseTo(1 / 90, 10);
  });
});

describe('server-owned visibility and cache isolation', () => {
  it('gates rows, totals and provenance before aggregation, even after a broader cache fill', () => {
    const query: Query = { measure: 'revenue', by: ['quarter'] };
    run(query);
    const result = run(query, q1);
    expect(result.rows).toHaveLength(1);
    expect(result.total).toBeCloseTo(95245.8078, 4);
    expect(result.source).not.toContain('2193-Q2');
    expect(result.source).not.toContain('56,350');
    expect(run({ ...query, filter: { quarter: ['2193-Q4'] } }, q1)).toMatchObject({ rows: [], total: 0 });
    expect(run({ measure: 'units', by: [] }, empty)).toMatchObject({ rows: [{ units: 0 }], total: 0 });
    expect(run({ measure: 'avg_discount', by: [] }, empty).total).toBeNull();
    expect(run({ measure: 'avg_order_value', by: [] }, empty).total).toBeNull();
    expect(run({ measure: 'orders_per_day', by: [] }, empty).total).toBeNull();
  });
  it('counts ratings at their own grain, with one title\'s stars as a histogram (#169)', () => {
    const all = run({ measure: 'ratings', by: ['stars'] });
    expect(all.rows).toEqual([{ stars: '1', ratings: 672 }, { stars: '2', ratings: 2068 }, { stars: '3', ratings: 8984 }, { stars: '4', ratings: 17498 }, { stars: '5', ratings: 21108 }]);
    expect(all.total).toBe(50330);
    expect(all.columns).toEqual([{ key: 'stars', label: 'Stars', type: 'string', nullable: false }, { key: 'ratings', label: 'Ratings', type: 'number', nullable: false }]);
    expect(all.source).toContain('Ratings from 50,330 visible matching ratings: count of individual ratings, joined directly to books');
    // Book grain, never through editions: the counts by title add up to every rating, CH392's unknown book included.
    const byTitle = run({ measure: 'ratings', by: ['title'] });
    expect(byTitle.rows.reduce((sum, row) => sum + row.ratings!, 0)).toBe(50330);
    expect(byTitle.rows.find(row => row.title === null)?.ratings).toBe(548);
    expect(byTitle.rows.find(row => row.title === 'Land Water Sky Space')?.ratings).toBe(95);
    // A title with no ratings has no row (no synthesized zeros), and its histogram is empty.
    expect(byTitle.rows.some(row => row.title === 'Cimornul')).toBe(false);
    expect(run({ measure: 'ratings', by: ['stars'], filter: { title: ['Cimornul'] } }).rows).toEqual([]);
    // One title's histogram reconciles with its average rating.
    const histogram = run({ measure: 'ratings', by: ['stars'], filter: { title: ['Land Water Sky Space'] } });
    const mean = histogram.rows.reduce((sum, row) => sum + Number(row.stars) * row.ratings!, 0) / histogram.total!;
    expect(mean).toBeCloseTo(run({ measure: 'avg_rating', by: [], filter: { title: ['Land Water Sky Space'] } }).total!, 10);
    expect(() => run({ measure: 'ratings', by: ['format'] })).toThrow(expect.objectContaining({ code: 'INCOMPATIBLE_DIMENSION' }));
  });
  it('splits by award winner, and filters by award without counting a book once per award (#169)', () => {
    const data = loadBookshop();
    const unitsOf = (titles: string[]) => data.saleLines.filter(line => titles.includes(line.title)).length;
    const awardedTitles = [...new Set(data.awards.map(award => award.title))];
    expect(awardedTitles).toHaveLength(17);
    const split = run({ measure: 'units', by: ['awarded'] });
    expect(split.rows).toEqual([{ awarded: 'no', units: 56350 - unitsOf(awardedTitles) }, { awarded: 'yes', units: unitsOf(awardedTitles) }]);
    expect(split.columns[0]).toEqual({ key: 'awarded', label: 'Award winner', type: 'string', nullable: true });
    // The Mallemaroking holds a Hugo and a Nebula: filtering on both counts its copies once.
    const hugo = data.awards.filter(award => award.name === 'Hugo Award').map(award => award.title);
    expect(run({ measure: 'units', by: [], filter: { award: ['Hugo Award'] } }).total).toBe(unitsOf(hugo));
    expect(run({ measure: 'units', by: [], filter: { award: ['Nebula Award'] } }).total).toBe(unitsOf(['The Mallemaroking']));
    expect(run({ measure: 'units', by: [], filter: { award: ['Hugo Award', 'Nebula Award'] } }).total).toBe(unitsOf(hugo));
    // Book grain too: ratings and checkouts take both, and the unknown book (CH392) is neither yes nor no.
    const ratings = run({ measure: 'avg_rating', by: ['awarded'] });
    expect(ratings.rows.map(row => row.awarded)).toEqual(['no', 'yes', null]);
    expect(run({ measure: 'checkouts', by: [], filter: { award: ['Pulitzer'] } }).total).toBeGreaterThan(0);
    expect(run({ measure: 'units', by: [], filter: { award: ['No such award'] } }).total).toBe(0);
  });
  it('splits by series volume and by whether a book is in a series (#169)', () => {
    const data = loadBookshop();
    const inSeries = data.saleLines.filter(line => line.book.series).length;
    expect(run({ measure: 'units', by: ['in_series'] }).rows).toEqual([{ in_series: 'no', units: 56350 - inSeries }, { in_series: 'yes', units: inSeries }]);
    // Each series' own volumes, from the workbook: The Mallemaroking Saga's first volume outsells its others.
    const saga = run({ measure: 'units', by: ['volume'], filter: { series: ['The Mallemaroking Saga'] } });
    expect(saga.rows).toEqual([{ volume: '1', units: 7334 }, { volume: '2', units: 4636 }, { volume: '3', units: 4077 }]);
    // Standalone books have no volume: their copies group as null, not an invented volume.
    const volumes = run({ measure: 'units', by: ['volume'] });
    expect(volumes.rows.map(row => row.volume)).toEqual(['1', '2', '3', '4', '5', '6', '7', null]);
    expect(volumes.rows.at(-1)!.units).toBe(56350 - inSeries);
    expect(volumes.columns[0]).toEqual({ key: 'volume', label: 'Volume', type: 'string', nullable: true });
    // Book grain: the unknown book (CH392) is neither in a series nor out of one.
    expect(run({ measure: 'avg_rating', by: ['in_series'] }).rows.map(row => row.in_series)).toEqual(['no', 'yes', null]);
    expect(run({ measure: 'checkouts', by: ['volume'], filter: { series: ['Inspector Ryeslton'] } }).rows.map(row => row.volume)).toEqual(['1', '2']);
  });
  it('splits sales by edition and list price, at the sale line\'s own edition (#169)', () => {
    const data = loadBookshop();
    // A title's editions are separate rows: Post Alley sold 51 hardcovers at $27.99 and 307 trade paperbacks.
    const post = run({ measure: 'units', by: ['edition', 'list_price'], filter: { title: ['Post Alley'] } });
    expect(post.rows).toEqual([{ edition: 'Post Alley (Hardcover)', list_price: '$27.99', units: 51 }, { edition: 'Post Alley (Trade paperback)', list_price: '$12.50', units: 307 }]);
    // Every edition with sales is one row, and Heliotrope Pajamas' two paperbacks are told apart by year.
    const editions = run({ measure: 'units', by: ['edition'] });
    expect(editions.rows).toHaveLength(new Set(data.saleLines.map(line => line.isbn)).size);
    expect(editions.rows.filter(row => row.edition!.startsWith('Heliotrope Pajamas (Paperback')).map(row => [row.edition, row.units]))
      .toEqual([['Heliotrope Pajamas (Paperback, 2181)', 211], ['Heliotrope Pajamas (Paperback, 2186)', 374]]);
    // Prices sort as amounts, not as text, and bands in their own order.
    const prices = run({ measure: 'units', by: ['list_price'] }).rows.map(row => row.list_price);
    expect(prices[0]).toBe('$5.99');
    expect(prices.at(-1)).toBe('$48.00');
    expect(prices).toHaveLength(25);
    expect(run({ measure: 'units', by: ['list_price'], sort: { column: 'list_price', direction: 'desc' }, limit: 1 }).rows[0].list_price).toBe('$48.00');
    const bands = run({ measure: 'units', by: ['price_band'] });
    expect(bands.rows).toEqual([{ price_band: 'under $10', units: 34404 }, { price_band: '$10 to $19.99', units: 10040 }, { price_band: '$20 to $29.99', units: 11541 }, { price_band: '$30 and up', units: 365 }]);
    expect(run({ measure: 'revenue', by: [], filter: { list_price: ['$27.99'] } }).total).toBeCloseTo(data.saleLines.filter(l => l.listPrice === 27.99).reduce((s, l) => s + l.revenue, 0), 6);
    // Book-grain measures don't take them: a book's ratings would multiply across its editions.
    for (const dimension of ['edition', 'list_price', 'price_band'] as const) {
      expect(() => run({ measure: 'avg_rating', by: [dimension] })).toThrow(expect.objectContaining({ code: 'INCOMPATIBLE_DIMENSION' }));
    }
    // A simulated line takes its own edition's price, as the save holds it.
    const view: QueryView = { periods: ['2194-Q1'], includeUndated: false, simulatedSales: [sale({ listPrice: 20, discount: 0.15 })] };
    expect(run({ measure: 'units', by: ['list_price', 'price_band'] }, view).rows).toEqual([{ list_price: '$20.00', price_band: '$20 to $29.99', units: 1 }]);
  });
  it('requires a separate explicit undated grant, regardless of prior cache entries', () => {
    for (const measure of ['avg_rating', 'ratings', 'checkouts'] as const) {
      run({ measure, by: [] });
      expect(() => run({ measure, by: [] }, q1)).toThrow(expect.objectContaining({ code: 'UNAVAILABLE_FACTS' }));
      expect(run({ measure, by: [] }, { ...empty, includeUndated: true }).total).not.toBeNull();
    }
  });
  it('derives simulated visibility from dates and never includes hidden facts in source counts', () => {
    const view: QueryView = { periods: ['2194-Q1'], includeUndated: false, simulatedSales: [sale(), sale({ id: 'future', date: '2195-01-01', quarter: 1, listPrice: 1_000_000 })] };
    const result = run({ measure: 'revenue', by: ['quarter'] }, view);
    expect(result).toMatchObject({ rows: [{ quarter: '2194-Q1', revenue: 17 }], total: 17 });
    expect(result.source).toContain('0 source and 1 simulated sale lines');
    expect(result.source).not.toContain('2195');
    expect(run({ measure: 'units', by: [] }, { ...view, periods: [] }).total).toBe(0);
  });
  it('does not let caller mutations poison cached results', () => {
    const query: Query = { measure: 'units', by: ['quarter'] };
    const result = run(query, q1);
    result.rows[0].units = 0; result.total = 0; result.source = 'changed';
    expect(run(query, q1).total).toBe(7785);
    const track = vi.fn();
    runQuery(query, q1, track);
    expect(track).toHaveBeenCalledWith('query_completed', expect.objectContaining({ measure: 'units', dimensionCount: 1, rowCount: 1, cacheHit: true }));
  });
  it('never records filters, results, view details or unvalidated input in telemetry', () => {
    const track = vi.fn();
    runQuery({ measure: 'revenue', by: [], filter: { title: ['SECRET_FILTER'] } }, q1, track);
    expect(() => runQuery({ measure: 'SECRET_ATTACK', by: [] }, q1, track)).toThrow();
    const events = JSON.stringify(track.mock.calls);
    expect(events).not.toContain('SECRET'); expect(events).not.toContain('2193');
    expect(events).toContain('query_failed');
  });
  it('rejects invalid server views and oversized simulated labels without silent truncation', () => {
    expect(() => run({ measure: 'units', by: [] }, { periods: ['2193-Q1', '2193-Q1'], includeUndated: false })).toThrow(expect.objectContaining({ code: 'INVALID_VIEW' }));
    const view: QueryView = { periods: ['2194-Q1'], includeUndated: false, simulatedSales: [sale({ format: 'x'.repeat(201) })] };
    expect(() => run({ measure: 'units', by: ['format'] }, view)).toThrow(expect.objectContaining({ code: 'RESULT_TOO_LARGE' }));
  });
});
