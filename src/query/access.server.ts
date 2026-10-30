import { randomBytes, timingSafeEqual } from 'node:crypto';
import { QueryError } from './errors';

// One capability per server-module lifetime. Never serialize this into route data,
// logs, model context, or a browser bundle. The spawner passes it only via child env.
const token = randomBytes(32).toString('base64url');
export function getQueryToken(): string { return token; }

export function authorizeQuery(request: Request): 'browser' | 'agent' {
  const authorization = request.headers.get('authorization');
  if (authorization !== null) {
    const expected = Buffer.from(`Bearer ${token}`);
    if (authorization.length === expected.length && Buffer.byteLength(authorization) === expected.length && timingSafeEqual(Buffer.from(authorization), expected)) return 'agent';
    throw new QueryError('UNAUTHORIZED', 'A valid query bearer token is required.');
  }
  const url = new URL(request.url);
  const origin = request.headers.get('origin');
  const site = request.headers.get('sec-fetch-site');
  // Local-only milestone: reject arbitrary Host/Origin pairs (DNS rebinding).
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (local && origin === url.origin && (site === null || site === 'same-origin')) return 'browser';
  throw new QueryError('UNAUTHORIZED', 'Use a same-origin local browser request or the query bearer token.');
}
