import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';
import type { MiddlewareFunction } from 'react-router';
import { loadBookshop } from '../bookshop/loader.server';
import type { QueryView } from '../query/types';
import { BASELINE_VIEW } from '../query/view.server';
import { dataVersion } from '../query/data-version.server';
import { DATA_DIR } from '../platform/analytics/instance.server';
import { trackServer } from '../platform/analytics/analytics.server';
import { onGameStarted } from '../alma/backstory.server';
import { createSaveStore, isSaveId, SaveError } from './store.server';
import { quarterCells } from './replay.server';
import { mergeCells } from '../query/sale-cells';
import type { TurnEvent } from '../simulation/turn';
import type { GameSave } from './types';
import { saveDate } from './progress';

export const saves = createSaveStore(path.join(DATA_DIR, 'saves'));
const COOKIE = 'orbital_save';
const active = new AsyncLocalStorage<string>();
/**
 * New games each process starts per minute. ORBITAL_NEW_GAMES_PER_MINUTE raises it for automated
 * browsers, where every test is a fresh save; anything but a positive integer keeps the default.
 */
export function newGamesPerMinute(value = process.env.ORBITAL_NEW_GAMES_PER_MINUTE): number {
  return value && /^[1-9]\d{0,8}$/.test(value) ? Number(value) : 30;
}
const NEW_GAMES_PER_MINUTE = newGamesPerMinute();
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
/** A quarter's Alma event as the engine reads it (type, params, stretch and drop), or null: Q1 and Q2 have none. */
export function eventOf(save: GameSave, quarter: string): TurnEvent | null {
  const record = save.alma?.find(r => r.quarter === quarter);
  return record ? { type: record.type, params: record.params, stretch: record.stretch, ...(record.drop === undefined ? {} : { drop: record.drop }) } : null;
}
export function queryViewForSave(save: GameSave): QueryView {
  // Each quarter's cells, replayed, checked and rolled up once per process (replay.server.ts), or from an older
  // save's stored lines.
  const cells = mergeCells(save.played.map(q => quarterCells(save.id, save.seed, q, loadBookshop, eventOf(save, q.period))));
  const periods = [...BASELINE_VIEW.periods, ...save.played.map(q => q.period)];
  if (!cells.lines) return { ...BASELINE_VIEW, periods };
  // The data version names these cells, so results over them can be cached (run-query.server.ts).
  return { ...BASELINE_VIEW, periods, version: dataVersion(save), simulatedCells: cells };
}
/**
 * The request's save, its date, and its query view. The view replays the played quarters' lines, so it's built
 * only when read: the shell's loader on every page reads just the save and the date, and a save whose replay no
 * longer matches (REPLAY_MISMATCH) still opens every page that doesn't need lines, Settings' Reset game
 * included (Plot, #198).
 */
export function getGameSession(request: Request) {
  const save = saves.read(resolveSaveId(request));
  let view: QueryView | undefined;
  return { save, date: saveDate(save), get queryView() { return (view ??= queryViewForSave(save)); } };
}
/** A new save, under the per-minute limit shared by first visits and Play again. The caller sets its cookie. */
export function startGame(): string {
  if (Date.now() - creationWindow >= 60_000) { creationWindow = Date.now(); creations = 0; }
  if (creations >= NEW_GAMES_PER_MINUTE) throw new Response('Too many new games. Try again shortly.', { status: 429, headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' } });
  creations++;
  const save = saves.create();
  trackServer('game_save_created', { version: 1 });
  // Alma writes the station's backstory in the background; the arrival never waits for it (src/alma).
  onGameStarted({ saveId: save.id, seed: save.seed }, { saves });
  return save.id;
}
/** One bootstrap before parallel shell/child loaders; never creates saves for API callers or POSTs. */
export const gameSessionMiddleware: MiddlewareFunction<Response> = async ({ request }, next) => {
  let id = cookieSaveId(request); let created = false;
  try { if (id) saves.read(id); }
  catch (error) { if (error instanceof SaveError && error.code === 'MISSING_SAVE') id = null; else throw error; }
  if (!id) {
    if (request.method !== 'GET') throw new Response('Start a game first.', { status: 401 });
    id = startGame(); created = true;
  }
  const response = await active.run(id, next);
  response.headers.set('Cache-Control', 'private, no-store');
  if (created) response.headers.append('Set-Cookie', saveCookie(id, request));
  return response;
};
