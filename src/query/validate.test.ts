import { describe, expect, it } from 'vitest';
import { validateQuery } from './validate';
import { DIMENSIONS, MEASURE_DIMENSIONS, MEASURES, QUERY_LIMITS } from './types';

describe('fixed query grammar', () => {
  it('accepts each measure and exact filter/sort shape without mutating input', () => {
    for (const measure of MEASURES) expect(validateQuery({ measure, by: [] }).measure).toBe(measure);
    const input = { measure: 'revenue', by: ['quarter'], filter: { genre: ['Mystery', 'Mystery'] }, sort: { column: 'revenue', direction: 'desc' }, limit: 2 };
    expect(validateQuery(input)).toMatchObject({ filter: { genre: ['Mystery'] } });
    expect(input.filter.genre).toHaveLength(2);
    for (const dimension of DIMENSIONS) {
      const measure = MEASURES.find(m => MEASURE_DIMENSIONS[m].includes(dimension))!;
      expect(validateQuery({ measure, by: [dimension] }).by).toEqual([dimension]);
    }
    // Stars belong to the ratings count only: not sales, and not the average rating.
    expect(() => validateQuery({ measure: 'revenue', by: ['stars'] })).toThrow(/does not support stars/);
    expect(() => validateQuery({ measure: 'avg_rating', by: ['stars'] })).toThrow(/does not support stars/);
  });
  it.each([
    null, [], 'SELECT * FROM sales', {}, { measure: 'sql', by: [] }, { measure: 'revenue' },
    { measure: 'revenue', by: ['quarter', 'month', 'title'] }, { measure: 'revenue', by: ['quarter', 'quarter'] },
    { measure: 'revenue', by: ['constructor'] }, { measure: 'revenue', by: [], view: { periods: ['9999-Q1'] } },
    { measure: 'revenue', by: [], filter: [] }, { measure: 'revenue', by: [], filter: { title: [] } },
    { measure: 'revenue', by: [], filter: { title: [null] } }, { measure: 'revenue', by: [], filter: { title: ['a'.repeat(201)] } },
    { measure: 'revenue', by: [], filter: { title: Array(51).fill('x') } }, { measure: 'revenue', by: [], filter: { unknown: ['x'] } },
    { measure: 'revenue', by: [], sort: { column: 'quarter', direction: 'asc' } }, { measure: 'revenue', by: [], sort: { column: 'revenue', direction: 'random' } },
    { measure: 'revenue', by: [], sort: { column: 'revenue', direction: 'asc', expression: 'eval()' } },
    { measure: 'revenue', by: [], limit: 0 }, { measure: 'revenue', by: [], limit: QUERY_LIMITS.rows + 1 },
    { measure: 'revenue', by: [], limit: 1.5 }, { measure: 'revenue', by: [], limit: '2' }, { measure: 'revenue', by: [], limit: Infinity },
    JSON.parse('{"measure":"revenue","by":[],"__proto__":{"admin":true}}'),
    JSON.parse('{"measure":"revenue","by":[],"filter":{"__proto__":["x"]}}'),
  ])('rejects invalid/extra/free-form input %#', input => {
    expect(() => validateQuery(input)).toThrow(expect.objectContaining({ code: 'INVALID_QUERY' }));
  });
  it.each([
    { measure: 'avg_rating', by: ['quarter'] }, { measure: 'avg_rating', by: [], filter: { format: ['Hardcover'] } },
    { measure: 'checkouts', by: ['publisher'] }, { measure: 'checkouts', by: [], filter: { discounted: ['yes'] } },
    { measure: 'checkouts', by: ['discount_rate'] },
  ])('rejects fanout and invented-calendar combinations %#', input => {
    expect(() => validateQuery(input)).toThrow(expect.objectContaining({ code: 'INCOMPATIBLE_DIMENSION' }));
  });
});
