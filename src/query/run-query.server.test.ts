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
  it('requires a separate explicit undated grant, regardless of prior cache entries', () => {
    for (const measure of ['avg_rating', 'checkouts'] as const) {
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
