import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';
import type { MiddlewareFunction } from 'react-router';
import { loadBookshop } from '../bookshop/loader.server';
import type { JoinedBook } from '../bookshop/types';
import type { QueryView } from '../query/types';
import { RELEASE, releaseBook } from '../simulation/release';
import { BASELINE_VIEW } from '../query/view.server';
import { DATA_DIR } from '../platform/analytics/instance.server';
import { trackServer } from '../platform/analytics/analytics.server';
import { createSaveStore, isSaveId, SaveError } from './store.server';
import type { GameSave } from './types';

export const saves = createSaveStore(path.join(DATA_DIR, 'saves'));
const COOKIE = 'orbital_save';
const active = new AsyncLocalStorage<string>();
let creationWindow = Date.now();
let creations = 0;
export function saveCookie(id: string, request: Request): string {
  if (!isSaveId(id)) throw new SaveError('INVALID_SAVE');
  return `${COOKIE}=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}
export function cookieSaveId(request: Request): string | null {
  const values = (request.headers.get('cookie') ?? '').split(';').map(v => v.trim()).filter(v => v.startsWith(COOKIE + '='));
  if (values.length !== 1) return null;
  const id = values[0].slice(COOKIE.length + 1);
  return isSaveId(id) ? id : null;
}
/** Only the HttpOnly cookie (or middleware's bootstrap) selects a browser save. */
export function resolveSaveId(request: Request): string {
  const id = active.getStore() ?? cookieSaveId(request);
  if (!id) throw new SaveError('MISSING_SAVE');
  saves.read(id); return id;
}
export function queryViewForSave(save: GameSave): QueryView {
  const sales = save.played.flatMap(q => q.sales);
  if (!sales.length) return { ...BASELINE_VIEW, periods: [...BASELINE_VIEW.periods, ...save.played.map(q => q.period)] };
  const data = loadBookshop();
  // The new volume is generated, not in the data: the engine's records join it (src/simulation/release.ts).
  const editions = new Map([...data.editions, RELEASE.edition].map(e => [e.isbn, e]));
  const books = new Map([...data.joinedBooks, releaseBook(data) as JoinedBook].map(b => [b.id, b]));
  const publishers = new Map(data.publishers.map(p => [p.id, p]));
  return { ...BASELINE_VIEW, periods: [...BASELINE_VIEW.periods, ...save.played.map(q => q.period)], simulatedSales: sales.map(sale => {
    const edition = editions.get(sale.isbn); const book = edition && books.get(edition.bookId); const publisher = edition && publishers.get(edition.publisherId);
    if (!edition || !book || !publisher) throw new SaveError('INVALID_SAVE');
    return { ...sale, book, title: book.title, author: book.author, genre: book.info?.genre ?? null, format: edition.format, publisher,
      listPrice: edition.listPrice, revenue: edition.listPrice * (1 - sale.discount) };
  }) };
}
export function getGameSession(request: Request) {
  const save = saves.read(resolveSaveId(request));
  return { save, queryView: queryViewForSave(save), date: save.played.length ? '2194-04-01' : '2194-01-01' };
}
/** One bootstrap before parallel shell/child loaders; never creates saves for API callers or POSTs. */
export const gameSessionMiddleware: MiddlewareFunction<Response> = async ({ request }, next) => {
  let id = cookieSaveId(request); let created = false;
  try { if (id) saves.read(id); }
  catch (error) { if (error instanceof SaveError && error.code === 'MISSING_SAVE') id = null; else throw error; }
  if (!id) {
    if (request.method !== 'GET') throw new Response('Start a game first.', { status: 401 });
    if (Date.now() - creationWindow >= 60_000) { creationWindow = Date.now(); creations = 0; }
    if (creations >= 30) throw new Response('Too many new games. Try again shortly.', { status: 429, headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' } });
    creations++;
    id = saves.create().id; created = true;
    trackServer('game_save_created', { version: 1 });
  }
  const response = await active.run(id, next);
  response.headers.set('Cache-Control', 'private, no-store');
  if (created) response.headers.append('Set-Cookie', saveCookie(id, request));
  return response;
};
