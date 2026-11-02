import { QueryError } from './errors';
import { isRecord } from './validate';
import type { QueryView } from './types';

export const BASELINE_VIEW: QueryView = Object.freeze({
  periods: Object.freeze(['2193-Q1', '2193-Q2', '2193-Q3', '2193-Q4'] as const),
  includeUndated: true,
});

/** Replace with a trusted save/session resolver when that feature lands. */
export function resolveQueryView(): QueryView { return BASELINE_VIEW; }

/**
 * Most periods a view may allow: 2193's four and every quarter the game can play (400, game/quarters.ts).
 * The 80 before the endless loop failed a save at 76 quarters.
 */
export const MAX_VIEW_PERIODS = 404;
/**
 * Most simulated lines a view may carry. A five-year save (20 quarters) is about 300,000 lines and some 500 MB of the
 * server's memory as views are built now (Frank's measurement, 2 Nov 2026), so a million is about 15 years and under
 * 2 GB. The 200,000 before the endless loop failed a save at about 13 quarters. Past this a save's ledgers refuse
 * rather than exhaust the heap, until views stop rebuilding every line per request.
 */
export const MAX_SIMULATED_LINES = 1_000_000;

export function validateView(view: QueryView): void {
  if (!isRecord(view) || Object.keys(view).some(key => !['periods', 'includeUndated', 'simulatedSales'].includes(key))
    || !Array.isArray(view.periods) || view.periods.length > MAX_VIEW_PERIODS
    || !view.periods.every(period => typeof period === 'string' && /^[1-9]\d{3}-Q[1-4]$/.test(period))
    || new Set(view.periods).size !== view.periods.length || typeof view.includeUndated !== 'boolean'
    || (view.simulatedSales !== undefined && (!Array.isArray(view.simulatedSales) || view.simulatedSales.length > MAX_SIMULATED_LINES))) {
    throw new QueryError('INVALID_VIEW', 'The server view must declare unique allowed periods and undated access within supported bounds.');
  }
}
