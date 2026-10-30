import { expect, it } from 'vitest';
import { serializeResult } from './result';
import { QUERY_LIMITS } from './types';
import type { QueryResult } from './types';

const base: QueryResult = { columns: [], rows: [], total: 0, source: 'Source' };
it('bounds labels, provenance, row counts and UTF-8 serialized bytes', () => {
  for (const result of [
    { ...base, source: 'x'.repeat(4097) },
    { ...base, rows: [{ title: 'x'.repeat(201) }] },
    { ...base, columns: [{ key: 'title' as const, label: 'x'.repeat(201), type: 'string' as const, nullable: false }] },
    { ...base, rows: Array.from({ length: 201 }, () => ({ title: 'ok' })) },
    { ...base, rows: Array.from({ length: 200 }, () => ({ title: '界'.repeat(200), author: '界'.repeat(200) })) },
  ]) expect(() => serializeResult(result)).toThrow(expect.objectContaining({ code: 'RESULT_TOO_LARGE' }));
  const body = serializeResult({ ...base, rows: [{ title: '界'.repeat(200) }] });
  expect(new TextEncoder().encode(body).byteLength).toBeLessThan(QUERY_LIMITS.responseBytes);
});
it('rejects nonfinite aggregation instead of serializing it as null', () => {
  expect(() => serializeResult({ ...base, total: Infinity })).toThrow(expect.objectContaining({ code: 'INVALID_VIEW' }));
});
