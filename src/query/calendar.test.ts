import { expect, it } from 'vitest';
import { eligibleDays, groupDays } from './calendar';

it('counts full calendar exposure, including leap days and zero-sale days', () => {
  const query = { measure: 'orders_per_day', by: [] } as const;
  expect(eligibleDays(query, { periods: ['2193-Q1'], includeUndated: false })).toHaveLength(90);
  expect(eligibleDays(query, { periods: ['2196-Q1'], includeUndated: false })).toHaveLength(91);
  expect(eligibleDays(query, { periods: [], includeUndated: false })).toEqual([]);
});
it('narrows exposure only with calendar filters and grouped calendar values', () => {
  const view = { periods: ['2193-Q1'], includeUndated: false } as const;
  const days = eligibleDays({ measure: 'orders_per_day', by: [], filter: { month: ['2193-01'], genre: ['No sales'], discount_rate: ['15%'] } }, view);
  expect(days).toHaveLength(31);
  expect(groupDays(days, { weekday: 'Monday', genre: 'No sales' })).toBe(4);
  expect(groupDays(days, { quarter: '2193-Q2' })).toBe(0);
});
