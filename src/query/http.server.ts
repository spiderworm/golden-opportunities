import { recordDiscoveries } from '../game/discoveries.server';
import { validateQuery } from './validate';
import { authorizeQuery, viewForAccess, type QueryAccess } from './access.server';
import { QueryError } from './errors';
import { runQuery } from './run-query.server';
import { emit, trackQuery } from './telemetry.server';
import { serializeResult } from './result';
import { investigateOnly, QUERY_LIMITS } from './types';
import type { QueryErrorCode, QueryErrorResponse, QueryTrack, QueryView } from './types';

const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin', Vary: 'Origin, Authorization' };
const status: Record<QueryErrorCode, number> = {
  INVALID_QUERY: 400, INCOMPATIBLE_DIMENSION: 400, UNAVAILABLE_FACTS: 403, INVALID_VIEW: 500,
  UNAUTHORIZED: 401, SESSION_ENDED: 401, METHOD_NOT_ALLOWED: 405, UNSUPPORTED_MEDIA_TYPE: 415, PAYLOAD_TOO_LARGE: 413, RATE_LIMITED: 429, INTERNAL_ERROR: 500, RESULT_TOO_LARGE: 422,
};

async function readJson(request: Request): Promise<unknown> {
  const type = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (type !== 'application/json' || ![null, 'identity'].includes(request.headers.get('content-encoding'))) throw new QueryError('UNSUPPORTED_MEDIA_TYPE', 'Send uncompressed application/json.');
  const length = request.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > QUERY_LIMITS.requestBytes)) throw new QueryError('PAYLOAD_TOO_LARGE', `Request body must be at most ${QUERY_LIMITS.requestBytes} bytes.`);
  if (!request.body) throw new QueryError('INVALID_QUERY', 'A JSON query body is required.');
  const reader = request.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const read = async () => {
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > QUERY_LIMITS.requestBytes) throw new QueryError('PAYLOAD_TOO_LARGE', `Request body must be at most ${QUERY_LIMITS.requestBytes} bytes.`);
        chunks.push(value);
      }
      const body = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
      try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)) as unknown; }
      catch { throw new QueryError('INVALID_QUERY', 'Body must be valid UTF-8 JSON.'); }
    };
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new QueryError('INVALID_QUERY', 'Request body timed out.')), 5000);
    });
    return await Promise.race([read(), deadline]);
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

interface Options {
  run?: typeof runQuery;
  resolveView?: (access: QueryAccess) => QueryView;
  track?: QueryTrack;
  now?: () => number;
}
/** Local-only access model. No IPs, client IDs, tokens or request content retained. */
export function createQueryHandler(options: Options = {}): (request: Request) => Promise<Response> {
  const run = options.run ?? runQuery;
  const resolveView = options.resolveView ?? viewForAccess;
  const track = options.track ?? trackQuery;
  const now = options.now ?? Date.now;
  // Keep both per-client-kind and global admission bounded, independent of save count.
  let windowStart = now();
  let counts = { browser: 0, agent: 0, total: 0 };
  let active = 0;
  return async request => {
    let admitted = false;
    const started = performance.now();
    try {
      if (request.method !== 'POST') throw new QueryError('METHOD_NOT_ALLOWED', 'Only POST is supported.');
      const caller = authorizeQuery(request).kind;
      if (new URL(request.url).search) throw new QueryError('INVALID_QUERY', 'Query parameters are not supported; send the query as JSON.');
      if (now() - windowStart >= 60_000) { windowStart = now(); counts = { browser: 0, agent: 0, total: 0 }; }
      if (counts[caller] >= 60 || counts.total >= 100 || active >= 8) throw new QueryError('RATE_LIMITED', 'Query capacity reached; retry later.');
      counts[caller]++; counts.total++; active++; admitted = true;
      const query = validateQuery(await readJson(request));
      // Investigate-only until Probe has reviewed it against Dewey's figures gate (types.ts, AGENT_DIMENSIONS).
      const unreviewed = caller === 'agent' ? investigateOnly(query) : null;
      if (unreviewed) throw new QueryError('INVALID_QUERY', `${unreviewed} isn't available to the assistant yet.`);
      // Body arrival is asynchronous: recheck expiry, revocation and revision after that wait.
      const access = authorizeQuery(request);
      const view = resolveView(access);
      const result = run(query, view, track);
      const body = serializeResult(result);
      recordDiscoveries(access.save, view, [{ query, result }]);
      emit(track, 'query_request_completed', { rowCount: result.rows.length, durationMs: performance.now() - started });
      return new Response(body, { status: 200, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } });
    } catch (error) {
      let known = error instanceof QueryError ? error : new QueryError('INTERNAL_ERROR', 'Query could not be completed.');
      if (known.message.length > QUERY_LIMITS.errorMessageLength) known = new QueryError('RESULT_TOO_LARGE', 'Query error output exceeds its bounds.');
      emit(track, 'query_request_failed', { code: known.code, durationMs: performance.now() - started });
      const response: QueryErrorResponse = { error: { code: known.code, message: known.code === 'INVALID_VIEW' ? 'The server data view is unavailable.' : known.message } };
      return Response.json(response, { status: status[known.code], headers: { ...headers,
        ...(known.code === 'METHOD_NOT_ALLOWED' ? { Allow: 'POST' } : {}),
        ...(['UNAUTHORIZED', 'SESSION_ENDED'].includes(known.code) ? { 'WWW-Authenticate': 'Bearer' } : {}),
        ...(known.code === 'RATE_LIMITED' ? { 'Retry-After': '60' } : {}),
      } });
    } finally { if (admitted) active--; }
  };
}
