import { randomUUID } from 'node:crypto';
import { loadBookshop } from '../bookshop/loader.server';
import { isPlan } from '../simulation/plan';
import { q2Candidates, q2PlanProblem, simulateQ2 } from '../simulation/q2';
import { simulateQuarter } from '../simulation/simulate';
import type { Outcome, Plan, Q2Plan, SimulatedLine } from '../simulation/types';
import { trackServer } from '../platform/analytics/analytics.server';
import { resolveSaveId, saveCookie, saves, startGame } from './session.server';
import { SaveError } from './store.server';
import { isOutcome, isQuarterOutcome } from './outcome';
import { currentQuarter as quarterOf, isFinished } from './progress';
import type { QuarterId } from './quarters';
import type { GameSave, PlayedQuarter, Q2GameOutcome } from './types';
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
function played<P extends QuarterId>(save: GameSave, period: P) {
  return save.played.find((q): q is Extract<PlayedQuarter, { period: P }> => q.period === period);
}
function refuseUnlessLocalPost(request: Request) {
  if (request.method !== 'POST') throw new Response('Use POST.', { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' } });
  if (!isLocalBrowserRequest(request)) throw new Response('Same-origin local requests only.', { status: 403 });
}
const alreadyPlayed = () => new Response('This quarter has already been played.', { status: 409 });
/** Reads never simulate, reset, or create saves. A quarter's plan and result, Q1's by default; null until it's played. */
export function getPlan(request: Request, period?: '2194-Q1'): Plan | null;
export function getPlan(request: Request, period: '2194-Q2'): Q2Plan | null;
export function getPlan(request: Request, period: QuarterId = '2194-Q1'): Plan | Q2Plan | null {
  try { return played(current(request), period)?.outcome.plan ?? null; } catch (error) { return failure(error); }
}
export function getOutcome(request: Request, period?: '2194-Q1'): Outcome | null;
export function getOutcome(request: Request, period: '2194-Q2'): Q2GameOutcome | null;
export function getOutcome(request: Request, period: QuarterId = '2194-Q1'): Outcome | Q2GameOutcome | null {
  try { return played(current(request), period)?.outcome ?? null; } catch (error) { return failure(error); }
}
/** The quarter the player is planning, or null once every quarter is played (the results are what's left). */
export function currentQuarter(request: Request): QuarterId | null {
  try { return quarterOf(current(request)); } catch (error) { return failure(error); }
}
/** Q2's picker: every edition sold in 2193, by title then format. Key it by ISBN; one book (bookId) can't be picked twice. */
export function getQ2Candidates() {
  return q2Candidates(loadBookshop()).map(({ isbn, bookId, title, format, listPrice }) => ({ isbn, bookId, title, format, listPrice }));
}
const visible = (lines: readonly SimulatedLine[]) => lines.map(({ id, sourceSheet, sourceRow, date, quarter, isbn, discount, itemId, orderId }) =>
  ({ id, sourceSheet, sourceRow, date, quarter, isbn, discount, itemId, orderId }));
/** The short revision-checked transaction both quarters share: it appends the quarter only if it's still the one to play. */
function commit(save: GameSave, quarter: PlayedQuarter) {
  if (!isQuarterOutcome(quarter.period, quarter.outcome) || quarter.outcome.totals.plan.units !== quarter.sales.length) throw new SaveError('INVALID_SAVE');
  saves.update(save.id, save.revision, draft => {
    if (quarterOf(draft) !== quarter.period) throw alreadyPlayed();
    draft.played.push(quarter);
  });
}
/** Pure engine work precedes a short revision-checked transaction. Concurrent/repeat play returns 409. */
export function submitPlan(request: Request, plan: Plan): { outcomeId: string } {
  const started = performance.now();
  try {
    refuseUnlessLocalPost(request);
    if (!isPlan(plan)) throw new Response('Choose up to two distinct levers.', { status: 400 });
    const save = current(request);
    if (quarterOf(save) !== '2194-Q1') throw alreadyPlayed();
    const canonical = structuredClone(plan);
    const result = simulateQuarter(canonical, save.seed, loadBookshop());
    const outcome: Outcome = { ...result.outcome, discoveries: [...save.discoveries] };
    if (!isOutcome(outcome) || JSON.stringify(outcome.plan) !== JSON.stringify(canonical)) throw new SaveError('INVALID_SAVE');
    const sales = visible(result.lines);
    const outcomeId = randomUUID();
    commit(save, { period: '2194-Q1', sales, outcomeId, outcome });
    event('game_quarter_committed', { quarter: 'Q1', leverCount: canonical.levers.length, units: sales.length, durationMs: performance.now() - started });
    return { outcomeId };
  } catch (error) {
    event('game_quarter_failed', { quarter: 'Q1', code: error instanceof SaveError ? error.code : error instanceof Response ? String(error.status) : 'INTERNAL_ERROR', durationMs: performance.now() - started });
    return failure(error);
  }
}
/**
 * Q2 like Q1: pure engine work, then the same transaction. A plan the player got wrong (Sim's
 * q2PlanProblem: "shape", "unknown-edition" or "same-title") is a 400 whose JSON body names it;
 * anything the engine throws after that is a 500.
 */
export function submitQ2Plan(request: Request, plan: unknown): { outcomeId: string } {
  const started = performance.now();
  try {
    refuseUnlessLocalPost(request);
    const data = loadBookshop();
    const problem = q2PlanProblem(plan, data);
    if (problem) throw Response.json({ problem }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    const save = current(request);
    if (quarterOf(save) !== '2194-Q2') throw quarterOf(save) === '2194-Q1' ? new Response('Play the first quarter first.', { status: 409 }) : alreadyPlayed();
    const canonical = structuredClone(plan as Q2Plan);
    const result = simulateQ2(canonical, save.seed, data);
    // Q1's discoveries stay on Q1's result; Q2's own (D, E, F) aren't detected yet.
    const outcome: Q2GameOutcome = { ...result.outcome, discoveries: [] };
    if (JSON.stringify(outcome.plan) !== JSON.stringify(canonical)) throw new SaveError('INVALID_SAVE');
    const sales = visible(result.lines);
    const outcomeId = randomUUID();
    commit(save, { period: '2194-Q2', sales, outcomeId, outcome });
    event('game_quarter_committed', { quarter: 'Q2', leverCount: canonical.levers.length, pickCount: canonical.picks.filter(p => p !== null).length,
      units: sales.length, durationMs: performance.now() - started });
    return { outcomeId };
  } catch (error) {
    event('game_quarter_failed', { quarter: 'Q2', code: error instanceof SaveError ? error.code : error instanceof Response ? String(error.status) : 'INTERNAL_ERROR', durationMs: performance.now() - started });
    return failure(error);
  }
}
/** Play again, once every quarter is played: a new save from 1 January with a new seed. Returns its Set-Cookie value; the old save expires unused. */
export function startNewGame(request: Request): string {
  try {
    refuseUnlessLocalPost(request);
    if (!isFinished(current(request))) throw new Response('Finish the half year first.', { status: 409, headers: { 'Cache-Control': 'no-store' } });
    return saveCookie(startGame(), request);
  } catch (error) {
    return failure(error);
  }
}
/** The opening transmission has been seen (opened or put off): the bell's alert is read, and the transmission doesn't return. Idempotent. */
export function markAlertSeen(request: Request): void {
  try {
    refuseUnlessLocalPost(request);
    // Not query data: Frank's write keeps queryRevision, so Dewey's answer in flight isn't cut off.
    saves.markAlertSeen(resolveSaveId(request));
  } catch (error) {
    return failure(error);
  }
}
