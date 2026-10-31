import { randomUUID } from 'node:crypto';
import { loadBookshop } from '../bookshop/loader.server';
import { isPlan } from '../simulation/plan';
import { simulateQuarter } from '../simulation/simulate';
import type { Outcome, Plan } from '../simulation/types';
import { trackServer } from '../platform/analytics/analytics.server';
import { resolveSaveId, saves } from './session.server';
import { SaveError } from './store.server';
import { isOutcome } from './outcome';
import { isLocalBrowserRequest } from '../query/access.server';

function event(name: string, props: Record<string, string | number | boolean>) {
  try { trackServer(name, props); } catch { /* A transport failure cannot undo a committed quarter. */ }
}
function failure(error: unknown): never {
  if (error instanceof Response) throw error;
  if (error instanceof SaveError) {
    if (error.code === 'MISSING_SAVE') throw new Response('Start a game.', { status: 401, headers: { 'Cache-Control': 'no-store' } });
    if (['SAVE_BUSY', 'STALE_SAVE'].includes(error.code)) throw new Response('Game state changed. Reload and try again.', { status: 409, headers: { 'Cache-Control': 'no-store' } });
    if (error.code === 'SAVE_CAPACITY') throw new Response('Save storage is full. Try again later.', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  throw new Response('The game could not be saved.', { status: 500, headers: { 'Cache-Control': 'no-store' } });
}
function current(request: Request) { return saves.read(resolveSaveId(request)); }
/** Reads never simulate, reset, or create saves. Cookie-selected M1 outcome only. */
export function getPlan(request: Request): Plan | null {
  try { return current(request).completion?.outcome.plan ?? null; } catch (error) { return failure(error); }
}
export function getOutcome(request: Request): Outcome | null {
  try { return current(request).completion?.outcome ?? null; } catch (error) { return failure(error); }
}
/** Pure engine work precedes a short revision-checked transaction. Concurrent/repeat play returns 409. */
export function submitPlan(request: Request, plan: Plan): { outcomeId: string } {
  const started = performance.now();
  try {
    if (request.method !== 'POST') throw new Response('Use POST.', { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' } });
    if (!isLocalBrowserRequest(request)) throw new Response('Same-origin local requests only.', { status: 403 });
    if (!isPlan(plan)) throw new Response('Choose up to two distinct levers.', { status: 400 });
    const save = current(request);
    if (save.completion || save.played.length) throw new Response('This quarter has already been played.', { status: 409 });
    const canonical = structuredClone(plan);
    const result = simulateQuarter(canonical, save.seed, loadBookshop());
    const outcome: Outcome = { ...result.outcome, discoveries: [...save.discoveries] };
    if (!isOutcome(outcome) || JSON.stringify(outcome.plan) !== JSON.stringify(canonical)
      || outcome.totals.plan.units !== result.lines.length) throw new SaveError('INVALID_SAVE');
    const sales = result.lines.map(({ id, sourceSheet, sourceRow, date, quarter, isbn, discount, itemId, orderId }) =>
      ({ id, sourceSheet, sourceRow, date, quarter, isbn, discount, itemId, orderId }));
    const outcomeId = randomUUID();
    saves.update(save.id, save.revision, draft => {
      if (draft.completion || draft.played.length) throw new Response('This quarter has already been played.', { status: 409 });
      draft.played = [{ period: '2194-Q1', sales }];
      draft.completion = { outcomeId, outcome };
    });
    event('game_quarter_committed', { leverCount: canonical.levers.length, units: sales.length, durationMs: performance.now() - started });
    return { outcomeId };
  } catch (error) {
    event('game_quarter_failed', { code: error instanceof SaveError ? error.code : error instanceof Response ? String(error.status) : 'INTERNAL_ERROR', durationMs: performance.now() - started });
    return failure(error);
  }
}
/** The opening transmission has been seen (opened or put off): the bell's alert is read, and the transmission doesn't return. Idempotent. */
export function markAlertSeen(request: Request): void {
  try {
    if (request.method !== 'POST') throw new Response('Use POST.', { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' } });
    if (!isLocalBrowserRequest(request)) throw new Response('Same-origin local requests only.', { status: 403 });
    const save = current(request);
    if (save.alertSeen) return;
    saves.update(save.id, save.revision, draft => { draft.alertSeen = true; });
  } catch (error) {
    return failure(error);
  }
}
