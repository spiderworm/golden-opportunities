import { QueryError } from './errors';
import { QUERY_LIMITS } from './types';
import type { QueryResult } from './types';

export function tooLarge(): never { throw new QueryError('RESULT_TOO_LARGE', 'Query output exceeds its bounds; reduce the grouping or row limit.'); }
export function checkLabel(value: string | null | undefined): void {
  if (typeof value === 'string' && value.length > QUERY_LIMITS.labelLength) tooLarge();
}
/** Enforce the same limits for direct server consumers and HTTP consumers. */
export function serializeResult(result: QueryResult): string {
  if (result.rows.length > QUERY_LIMITS.rows || result.source.length > QUERY_LIMITS.sourceLength) tooLarge();
  for (const column of result.columns) checkLabel(column.label);
  for (const row of result.rows) for (const value of Object.values(row)) {
    if (typeof value === 'string') checkLabel(value);
    if (typeof value === 'number' && !Number.isFinite(value)) throw new QueryError('INVALID_VIEW', 'Aggregation exceeded the supported numeric range.');
  }
  if (result.total !== null && !Number.isFinite(result.total)) throw new QueryError('INVALID_VIEW', 'Aggregation exceeded the supported numeric range.');
  const body = JSON.stringify(result);
  if (new TextEncoder().encode(body).byteLength > QUERY_LIMITS.responseBytes) tooLarge();
  return body;
}
