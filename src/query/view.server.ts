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
 * Most simulated lines a view may carry. A five-year save (20 quarters, 302,517 lines) took the server from 322 MB to
 * 830 to 1,000 MB as views are built now (Frank's measurement, 2 Nov 2026): 1.7 to 2.2 KB a line. So 600,000 is
 * about ten years and 1.0 to 1.3 GB more (Sim, #242). The 200,000 before the endless loop failed a save at about 13
 * quarters. Past this a save's ledgers refuse rather than exhaust the heap, until views stop rebuilding every line
 * per request.
 */
export const MAX_SIMULATED_LINES = 600_000;

export function validateView(view: QueryView): void {
  if (!isRecord(view) || Object.keys(view).some(key => !['periods', 'includeUndated', 'simulatedSales', 'simulatedCells'].includes(key))
    || !Array.isArray(view.periods) || view.periods.length > MAX_VIEW_PERIODS
    || !view.periods.every(period => typeof period === 'string' && /^[1-9]\d{3}-Q[1-4]$/.test(period))
    || new Set(view.periods).size !== view.periods.length || typeof view.includeUndated !== 'boolean'
    || (view.simulatedSales !== undefined && (!Array.isArray(view.simulatedSales) || view.simulatedSales.length > MAX_SIMULATED_LINES))
    || (view.simulatedCells !== undefined && (view.simulatedSales !== undefined || !isRecord(view.simulatedCells) || !Array.isArray(view.simulatedCells.cells)
      || !Array.isArray(view.simulatedCells.spanning) || view.simulatedCells.lines > MAX_SIMULATED_LINES))) {
    throw new QueryError('INVALID_VIEW', 'The server view must declare unique allowed periods and undated access within supported bounds.');
  }
}
