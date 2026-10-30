import { QueryError } from './errors';
import { resolveSaveId, saves, queryViewForSave } from '../game/session.server';
import { saveForQueryToken } from '../game/query-token.server';
import { SaveError } from '../game/store.server';
import type { GameSave } from '../game/types';

/** Shared local browser boundary; Host never chooses a token destination or save. */
export function isLocalBrowserRequest(request: Request): boolean {
  const url = new URL(request.url);
  const origin = request.headers.get('origin');
  const site = request.headers.get('sec-fetch-site');
  return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    && origin === url.origin && (site === null || site === 'same-origin');
}
export interface QueryAccess { kind: 'browser' | 'agent'; save: GameSave }
export function authorizeQuery(request: Request): QueryAccess {
  const authorization = request.headers.get('authorization');
  if (authorization !== null) {
    const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(authorization);
    if (!match) throw new QueryError('UNAUTHORIZED', 'A valid query bearer token is required.');
    return { kind: 'agent', save: saveForQueryToken(match[1]) };
  }
  if (!isLocalBrowserRequest(request)) throw new QueryError('UNAUTHORIZED', 'Use a same-origin local browser request.');
  try { return { kind: 'browser', save: saves.read(resolveSaveId(request)) }; }
  catch (error) {
    if (error instanceof SaveError && error.code === 'MISSING_SAVE') throw new QueryError('UNAUTHORIZED', 'Start a game first.');
    if (error instanceof SaveError && error.code === 'SAVE_BUSY') throw new QueryError('RATE_LIMITED', 'Game state is busy. Retry shortly.');
    throw error;
  }
}
/** Uses the authorized snapshot; request bodies cannot grant periods or select saves. */
export function viewForAccess(access: QueryAccess) { return queryViewForSave(access.save); }
