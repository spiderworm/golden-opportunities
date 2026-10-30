import { QueryError } from './errors';
import { isRecord } from './validate';
import type { QueryView } from './types';

export const BASELINE_VIEW: QueryView = Object.freeze({
  periods: Object.freeze(['2193-Q1', '2193-Q2', '2193-Q3', '2193-Q4'] as const),
  includeUndated: true,
});

/** Replace with a trusted save/session resolver when that feature lands. */
export function resolveQueryView(): QueryView { return BASELINE_VIEW; }

export function validateView(view: QueryView): void {
  if (!isRecord(view) || Object.keys(view).some(key => !['periods', 'includeUndated', 'simulatedSales'].includes(key))
    || !Array.isArray(view.periods) || view.periods.length > 80
    || !view.periods.every(period => typeof period === 'string' && /^[1-9]\d{3}-Q[1-4]$/.test(period))
    || new Set(view.periods).size !== view.periods.length || typeof view.includeUndated !== 'boolean'
    || (view.simulatedSales !== undefined && (!Array.isArray(view.simulatedSales) || view.simulatedSales.length > 200_000))) {
    throw new QueryError('INVALID_VIEW', 'The server view must declare unique allowed periods and undated access within supported bounds.');
  }
}
