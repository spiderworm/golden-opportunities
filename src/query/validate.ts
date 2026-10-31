import { QueryError } from './errors';
import { DIMENSIONS, MEASURES, MEASURE_DIMENSIONS, QUERY_LIMITS } from './types';
import type { Dimension, Measure, Query } from './types';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
const dimension = (value: unknown): value is Dimension => typeof value === 'string' && (DIMENSIONS as readonly string[]).includes(value);
const measure = (value: unknown): value is Measure => typeof value === 'string' && (MEASURES as readonly string[]).includes(value);
function invalid(message: string): never { throw new QueryError('INVALID_QUERY', message); }
function keys(object: Record<string, unknown>, allowed: readonly string[], name: string): void {
  if (Object.keys(object).some(key => !allowed.includes(key))) invalid(`${name} contains an unknown property.`);
}

/** Strict allowlist, shared by HTTP and direct server callers. Returns a fresh value. */
export function validateQuery(input: unknown): Query {
  if (!isRecord(input)) invalid('Query must be a JSON object.');
  keys(input, ['measure', 'by', 'filter', 'sort', 'limit'], 'Query');
  if (!measure(input.measure)) invalid(`Measure must be one of: ${MEASURES.join(', ')}.`);
  if (!Array.isArray(input.by) || input.by.length > QUERY_LIMITS.dimensions || !input.by.every(dimension)) invalid('by must contain zero to two allowed dimensions.');
  if (new Set(input.by).size !== input.by.length) invalid('Grouping dimensions must be distinct.');
  const result: Query = { measure: input.measure, by: [...input.by] };
  if (Object.hasOwn(input, 'filter')) {
    if (!isRecord(input.filter)) invalid('filter must be an object of dimension arrays.');
    const filter: NonNullable<Query['filter']> = {};
    for (const [key, values] of Object.entries(input.filter)) {
      if (!dimension(key)) invalid('filter contains an unknown dimension.');
      if (!Array.isArray(values) || values.length < 1 || values.length > QUERY_LIMITS.filterValues || !values.every(v => typeof v === 'string' && v.length > 0 && v.length <= QUERY_LIMITS.filterValueLength)) invalid(`Each filter must have 1–${QUERY_LIMITS.filterValues} nonempty strings of at most ${QUERY_LIMITS.filterValueLength} characters.`);
      // A month names its year ("2193-04"): a bare "04" would match nothing now that two years can be visible.
      if (key === 'month' && !(values as string[]).every(v => /^\d{4}-(0[1-9]|1[0-2])$/.test(v))) invalid('Month filters are year and month, like 2193-04.');
      filter[key] = [...new Set(values as string[])];
    }
    result.filter = filter;
  }
  const used = [...result.by, ...Object.keys(result.filter ?? {}) as Dimension[]];
  for (const key of used) {
    if (!MEASURE_DIMENSIONS[result.measure].includes(key)) throw new QueryError('INCOMPATIBLE_DIMENSION', `${result.measure} does not support ${key}. Allowed dimensions: ${MEASURE_DIMENSIONS[result.measure].join(', ')}.`);
  }
  if (Object.hasOwn(input, 'sort')) {
    if (!isRecord(input.sort)) invalid('sort must be an object.');
    keys(input.sort, ['column', 'direction'], 'sort');
    const { column, direction } = input.sort;
    if (!(measure(column) && column === result.measure) && !(dimension(column) && result.by.includes(column))) invalid('Sort column must be the selected measure or a grouped dimension.');
    if (direction !== 'asc' && direction !== 'desc') invalid('Sort direction must be asc or desc.');
    result.sort = { column, direction };
  }
  if (Object.hasOwn(input, 'limit')) {
    if (typeof input.limit !== 'number' || !Number.isInteger(input.limit) || input.limit < 1 || input.limit > QUERY_LIMITS.rows) invalid(`limit must be an integer from 1 to ${QUERY_LIMITS.rows}.`);
    result.limit = input.limit;
  }
  return result;
}
