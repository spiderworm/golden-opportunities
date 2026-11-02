import { describe, expect, it } from 'vitest';
import type { Query, QueryResult, QueryView } from '../query/types';
import { laterEvidenceFromQuery, laterFound, laterOffers, type LaterContext } from './later-discoveries';

const view: QueryView = { periods: ['2193-Q1', '2193-Q2', '2193-Q3', '2193-Q4', '2194-Q1', '2194-Q2'], includeUndated: true };
const ctx = (over: Partial<LaterContext> = {}): LaterContext => ({ quarter: '2194-Q3', last: '2194-Q2', yearBefore: '2193-Q3',
  event: { type: 'genre_surge', params: { genre: 'Mystery', month: 2, percent: 20 } }, weakest: ['profit'], ...over });
const result = (rows: QueryResult['rows'], truncated = false): QueryResult => ({ columns: [], rows, total: 1, source: '', truncated });
const keys = (query: Query, rows: QueryResult['rows'], c = ctx(), truncated = false) => laterEvidenceFromQuery(query, view, result(rows, truncated), c);
const titles = (n: number, quarter = '2193-Q3') => Array.from({ length: n }, (_, i) => ({ title: `T${i}`, quarter, units: 5 }));

describe("a later quarter's discoveries (endless.md section 5, Plot's rulings on #218 and #220)", () => {
  it('offer the event, the record and the weakest measure, with what their texts name', () => {
    expect(laterOffers(ctx()).map(o => o.id)).toEqual(['event', 'record', 'weakest']);
    expect(laterOffers(ctx()).find(o => o.id === 'event')!.params).toEqual({ type: 'genre_surge', yearBefore: '2193-Q3', genre: 'Mystery' });
    // Author fares and a quiet quarter offer no event discovery; a perfect last quarter has no weakest measure.
    expect(laterOffers(ctx({ event: { type: 'author_fares', params: { cost: 300 } } })).map(o => o.id)).toEqual(['record', 'weakest']);
    expect(laterOffers(ctx({ event: { type: 'quiet_quarter', params: {} }, weakest: [] })).map(o => o.id)).toEqual(['record']);
  });

  it("find a genre event from units by title in that genre, a year before, with at least 10 titles", () => {
    const q: Query = { measure: 'units', by: ['title', 'quarter'], filter: { genre: ['Mystery'] } };
    expect(keys(q, titles(10))).toContain('event');
    expect(keys(q, titles(9))).not.toContain('event');
    expect(keys(q, titles(10, '2194-Q2'))).not.toContain('event');
    expect(keys({ ...q, filter: { genre: ['Romance'] } }, titles(10))).not.toContain('event');
    expect(keys(q, titles(12), ctx(), true)).toEqual([]);
  });

  it('find quiet days from orders by weekday for a past quarter, and format costs from units by format a year before', () => {
    const quiet = ctx({ event: { type: 'quiet_days', params: { weekday: 'Tuesday', percent: 15 } } });
    expect(keys({ measure: 'orders', by: ['weekday'], filter: { quarter: ['2194-Q2'] } }, [{ weekday: 'Tuesday', orders: 9 }], quiet)).toContain('event');
    expect(keys({ measure: 'revenue', by: ['weekday'], filter: { quarter: ['2194-Q2'] } }, [{ weekday: 'Tuesday', revenue: 9 }], quiet)).not.toContain('event');
    const costs = ctx({ event: { type: 'format_costs', params: { format: 'Hardcover', percent: 68 } } });
    expect(keys({ measure: 'revenue', by: ['format'], filter: { quarter: ['2193-Q3'] } }, [{ format: 'Hardcover', revenue: 9 }], costs)).toContain('event');
    expect(keys({ measure: 'revenue', by: ['format'], filter: { quarter: ['2193-Q2'] } }, [{ format: 'Hardcover', revenue: 9 }], costs)).not.toContain('event');
  });

  it('find the record when one view, or two matching views, show the last quarter and the year before', () => {
    const both = keys({ measure: 'revenue', by: ['quarter'] }, [{ quarter: '2193-Q3', revenue: 1 }, { quarter: '2194-Q2', revenue: 2 }]);
    expect(both).toEqual(expect.arrayContaining(['r:last', 'r:year']));
    expect(laterFound({ a: both }, ctx())).toContain('record');
    // Two views of one scope, one each, as F allows; split across scopes, they don't count.
    expect(laterFound({ a: ['r:last'], b: ['r:year'] }, ctx())).not.toContain('record');
    expect(laterFound({ a: ['r:last', 'r:year'] }, ctx())).toContain('record');
  });

  it('find the weakest measure through its ledger measure, for the last quarter; Happiness by title, undated', () => {
    expect(keys({ measure: 'revenue', by: ['month'], filter: { quarter: ['2194-Q2'] } }, [{ month: '2194-04', revenue: 3 }])).toContain('weakest');
    expect(keys({ measure: 'revenue', by: ['month'], filter: { quarter: ['2194-Q1'] } }, [{ month: '2194-01', revenue: 3 }])).not.toContain('weakest');
    expect(keys({ measure: 'orders', by: ['month'], filter: { quarter: ['2194-Q2'] } }, [{ month: '2194-04', orders: 3 }])).not.toContain('weakest');
    const culture = ctx({ weakest: ['culture'] });
    expect(keys({ measure: 'units', by: ['title'], filter: { quarter: ['2194-Q2'] } }, [{ title: 'T', units: 3 }], culture)).toContain('weakest');
    expect(keys({ measure: 'units', by: ['month'], filter: { quarter: ['2194-Q2'] } }, [{ month: '2194-05', units: 3 }], culture)).not.toContain('weakest');
    // Tied binders: only the first, which the offer and its texts name, counts.
    const tied = ctx({ weakest: ['profit', 'culture'] });
    expect(keys({ measure: 'units', by: ['title'], filter: { quarter: ['2194-Q2'] } }, [{ title: 'T', units: 3 }], tied)).not.toContain('weakest');
    expect(keys({ measure: 'revenue', by: ['title'], filter: { quarter: ['2194-Q2'] } }, [{ title: 'T', revenue: 3 }], tied)).toContain('weakest');
    const happiness = ctx({ weakest: ['happiness'] });
    expect(keys({ measure: 'avg_rating', by: ['title'] }, [{ title: 'T', avg_rating: 4.1 }], happiness)).toContain('weakest');
  });

  it('count only what the quarter offers', () => {
    expect(laterFound({ a: ['event', 'weakest'] }, ctx({ event: { type: 'quiet_quarter', params: {} }, weakest: [] }))).toEqual([]);
  });
});
