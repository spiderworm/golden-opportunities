import { describe, expect, it } from 'vitest';
import { runQuery } from '../query/run-query.server';
import { BASELINE_VIEW } from '../query/view.server';
import type { Query, QueryView } from '../query/types';
import { evidenceFromQuery } from './discovery-rules';
import { discoveriesFromEvidence, discoveryParts } from './discovery-evidence';
const evidence = (q: Query, view: QueryView = BASELINE_VIEW) => evidenceFromQuery(q, view, runQuery(q, view, () => {}));
const shape: Query = { measure: 'revenue', by: ['genre', 'quarter'] };
const size: Query = { measure: 'avg_order_value', by: ['quarter'] };
const promotion: Query = { measure: 'units', by: ['title', 'month'], filter: { discount_rate: ['15%'] } };

describe('discovery evidence from real returned workbook rows', () => {
  it.each(['genre', 'format', 'publisher'] as const)('A needs both broad %s shape and order size', dimension => {
    const a1 = evidence({ ...shape, by: [dimension, 'quarter'] });
    expect(discoveryParts(a1).shape).toBe(true);
    expect(discoveriesFromEvidence(a1)).toEqual([]);
    expect(discoveriesFromEvidence([...a1, ...evidence(size)])).toEqual(['A']);
  });
  it('accumulates quarters but never mixes a different measure or breakdown for A1', () => {
    const q3 = evidence({ measure: 'units', by: ['genre'], filter: { quarter: ['2193-Q3'] } });
    const q4 = evidence({ measure: 'units', by: ['genre'], filter: { quarter: ['2193-Q4'] } });
    expect(discoveryParts([...q3, ...q4]).shape).toBe(true);
    const other = evidence({ measure: 'revenue', by: ['genre'], filter: { quarter: ['2193-Q4'] } });
    expect(discoveryParts([...q3, ...other]).shape).toBe(false);
    expect(discoveryParts(evidence({ measure: 'revenue', by: ['genre'] })).shape).toBe(false);
    expect(discoveryParts(evidence({ ...shape, filter: { genre: ['Fiction', 'Nonfiction'] } })).shape).toBe(false);
  });
  it('requires all six months for monthly order-size evidence and rejects other measures', () => {
    expect(discoveryParts(evidence({ ...size, by: ['month'] })).size).toBe(true);
    expect(discoveryParts(evidence({ ...size, by: ['month'], filter: { month: ['2193-07', '2193-12'] } })).size).toBe(false);
    expect(discoveryParts(evidence({ ...size, measure: 'avg_discount' })).size).toBe(false);
  });
  it('B requires every weekday and both quarters, including two month samples', () => {
    expect(discoveriesFromEvidence(evidence({ measure: 'orders_per_day', by: ['weekday', 'quarter'] }))).toEqual(['B']);
    expect(discoveriesFromEvidence(evidence({ measure: 'orders', by: ['weekday', 'month'], filter: { month: ['2193-07', '2193-10'] } }))).toEqual(['B']);
    expect(discoveriesFromEvidence(evidence({ measure: 'orders', by: ['weekday'], filter: { quarter: ['2193-Q3'] } }))).toEqual([]);
    expect(discoveriesFromEvidence(evidence({ measure: 'orders', by: ['weekday', 'quarter'], filter: { weekday: ['Monday', 'Saturday', 'Sunday'] } }))).toEqual([]);
    expect(discoveriesFromEvidence(evidence({ measure: 'avg_order_value', by: ['weekday', 'quarter'] }))).toEqual([]);
  });
  it('C needs title, month and exact 15% evidence in at least three distinct months', () => {
    expect(discoveriesFromEvidence(evidence(promotion))).toEqual(['C']);
    expect(discoveriesFromEvidence(evidence({ ...promotion, by: ['title'] }))).toEqual([]);
    expect(discoveriesFromEvidence(evidence({ ...promotion, filter: { discount_rate: ['15%', '10%'] } }))).toEqual([]);
    expect(discoveriesFromEvidence(evidence({ ...promotion, measure: 'orders' }))).toEqual([]);
    const december = evidence({ measure: 'revenue', by: ['month'], filter: { title: ['Hashtag QuokkaSelfie'], discount_rate: ['15%'] } });
    expect(discoveryParts(december)).toMatchObject({ months: 1, quokka: true });
    expect(discoveriesFromEvidence([...december, ...december, ...december])).toEqual([]);
    const pieces = ['2193-01', '2193-02', '2193-03'].flatMap(month => evidence({ measure: 'units', by: ['title', 'discount_rate'], filter: { month: [month] } }));
    expect(discoveriesFromEvidence(pieces)).toEqual(['C']);
  });
  it('never awards empty, truncated, hidden or simulated-period views', () => {
    expect(evidence({ ...promotion, limit: 2 })).toEqual([]);
    expect(evidence({ ...promotion, filter: { title: ['does not exist'], discount_rate: ['15%'] } })).toEqual([]);
    expect(evidence(promotion, { periods: [], includeUndated: true })).toEqual([]);
    expect(evidence(promotion, { ...BASELINE_VIEW, periods: [...BASELINE_VIEW.periods, '2194-Q1'] })).toEqual([]);
    expect(discoveryParts(evidence(shape, { periods: ['2193-Q3'], includeUndated: true })).shape).toBe(false);
  });
});

it('requires the same category set in both quarters, not two unrelated threshold-sized sets', () => {
  const keys = [0, 1, 2, 3, 4, 5].map(i => `a1:revenue:genre:3:${i}`)
    .concat([2, 3, 4, 5, 6, 7].map(i => `a1:revenue:genre:4:${i}`));
  expect(discoveryParts(keys).shape).toBe(false);
});
it('does not infer C from zero-value title-month rows', () => {
  const result = runQuery(promotion, BASELINE_VIEW, () => {});
  result.rows = result.rows.map(row => ({ ...row, units: 0 }));
  expect(evidenceFromQuery(promotion, BASELINE_VIEW, result)).toEqual([]);
});
