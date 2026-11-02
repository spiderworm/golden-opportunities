import { randomUUID } from 'node:crypto';
import { loadBookshop } from '../bookshop/loader.server';
import { isPlan } from '../simulation/plan';
import { q2Candidates, q2PlanProblem, simulateQ2 } from '../simulation/q2';
import { simulateQuarter } from '../simulation/simulate';
import type { Outcome, Plan, Q2Plan } from '../simulation/types';
import type { Sale } from '../bookshop/types';
import { linesHash, rememberLines, visible } from './replay.server';
import { trackServer } from '../platform/analytics/analytics.server';
import { resolveSaveId, saveCookie, saves, startGame } from './session.server';
import { SaveError } from './store.server';
import { isOutcome, isQuarterOutcome } from './outcome';
import { currentQuarter as quarterOf, isFinished } from './progress';
import type { QuarterId } from './quarters';
import { Q1_DISCOVERIES, Q2_DISCOVERIES, type GameSave, type PlayedQuarter, type Q2GameOutcome } from './types';
import { isLocalBrowserRequest } from '../query/access.server';
import { onQuarterCommitted } from '../alma/hook.server';
import { almaRecordFor } from '../alma/hook.server';
import type { AlmaRecord } from '../alma/record';
import { MEASURE_NAMES } from '../alma/sentences';
import type { BossId } from '../platform/bosses/bosses';
import { simulateTurn } from '../simulation/turn';
import { strikes } from '../simulation/strikes';
import type { MeasureId, Q2SimulationResult } from '../simulation/types';
import { quarterIndex } from './quarters';


function event(name: string, props: Record<string, string | number | boolean>) {
  try { trackServer(name, props); } catch { /* A transport failure cannot undo a committed quarter. */ }
}
function failure(error: unknown): never {
  if (error instanceof Response) throw error;
  if (error instanceof SaveError) {
    if (error.code === 'MISSING_SAVE') throw new Response('Start a game.', { status: 401, headers: { 'Cache-Control': 'no-store' } });
    if (['SAVE_BUSY', 'STALE_SAVE'].includes(error.code)) throw new Response('Game state changed. Reload and try again.', { status: 409, headers: { 'Cache-Control': 'no-store' } });
    if (error.code === 'SAVE_CAPACITY') throw new Response('Save storage is full. Try again later.', { status: 503, headers: { 'Cache-Control': 'no-store' } });
    // The engine changed since a quarter was played: this version can't replay the save, and won't rescore it.
    if (error.code === 'REPLAY_MISMATCH') throw new Response("This game was saved by an earlier version, and can't be replayed. Start over from Settings.", { status: 409, headers: { 'Cache-Control': 'no-store' } });
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
/**
 * The short revision-checked transaction both quarters share: it appends the quarter only if it's still the one to
 * play. The save keeps the lines' hash and count, not the lines (replay.server.ts); the lines just played are
 * remembered, so the quarter's first queries don't replay it.
 */
function commit(save: GameSave, quarter: Omit<PlayedQuarter, 'lines' | 'sales'> & Pick<PlayedQuarter, 'period'>, sales: Sale[]) {
  const kept = { ...quarter, lines: { hash: linesHash(sales), count: sales.length } } as PlayedQuarter;
  if (!isQuarterOutcome(kept.period, kept.outcome) || kept.outcome.totals.plan.units !== sales.length) throw new SaveError('INVALID_SAVE');
  const after = saves.update(save.id, save.revision, draft => {
    if (quarterOf(draft) !== kept.period) throw alreadyPlayed();
    draft.played.push(kept);
  });
  rememberLines(save.id, kept, sales);
  // Alma prepares the next quarter in the background (src/alma): it never waits, and never throws into the submit.
  // Not for a player the panel has just removed: there's no next quarter to prepare.
  if (quarterOf(after) !== null) onQuarterCommitted({ saveId: save.id, quarter: quarter.period, seed: save.seed });
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
    const outcome: Outcome = { ...result.outcome, discoveries: Q1_DISCOVERIES.filter(d => save.discoveries.includes(d)) };
    if (!isOutcome(outcome) || JSON.stringify(outcome.plan) !== JSON.stringify(canonical)) throw new SaveError('INVALID_SAVE');
    const sales = visible(result.lines);
    const outcomeId = randomUUID();
    commit(save, { period: '2194-Q1', outcomeId, outcome }, sales);
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
    const save = current(request);
    if (quarterOf(save) !== '2194-Q2') throw quarterOf(save) === '2194-Q1' ? new Response('Play the first quarter first.', { status: 409 }) : alreadyPlayed();
    const data = loadBookshop();
    const problem = q2PlanProblem(plan, data);
    if (problem) throw Response.json({ problem }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    // In the engine's key order, whatever order the request sent: the stored plan is compared with the outcome's.
    const { picks, levers } = plan as Q2Plan;
    const canonical: Q2Plan = { picks: [...picks], levers: [...levers] };
    const result = simulateQ2(canonical, save.seed, data);
    // Q1's discoveries stay on Q1's result; Q2's are its own.
    const outcome: Q2GameOutcome = { ...result.outcome, discoveries: Q2_DISCOVERIES.filter(d => save.discoveries.includes(d)) };
    if (JSON.stringify(outcome.plan) !== JSON.stringify(canonical)) throw new SaveError('INVALID_SAVE');
    const sales = visible(result.lines);
    const outcomeId = randomUUID();
    commit(save, { period: '2194-Q2', outcomeId, outcome }, sales);
    event('game_quarter_committed', { quarter: 'Q2', leverCount: canonical.levers.length, pickCount: canonical.picks.filter(p => p !== null).length,
      units: sales.length, durationMs: performance.now() - started });
    return { outcomeId };
  } catch (error) {
    event('game_quarter_failed', { quarter: 'Q2', code: error instanceof SaveError ? error.code : error instanceof Response ? String(error.status) : 'INTERNAL_ERROR', durationMs: performance.now() - started });
    return failure(error);
  }
}
/** Alma's record has this long to arrive before the scripted event stands in; drawing that adds up to about 2 s (Sage). */
export const ALMA_BUDGET_MS = 8_000;

/** A later quarter's Alma record: the saved one, or Alma's turn within the budget, or the scripted event. Null in Q1 and Q2. */
async function recordFor(save: GameSave, quarter: QuarterId): Promise<AlmaRecord | null> {
  if (quarterIndex(quarter) < 2) return null;
  return save.alma?.find(r => r.quarter === quarter) ?? (await almaRecordFor(save.id, ALMA_BUDGET_MS));
}

/**
 * What Decide's brief needs to fill Plot's templates (endless-copy.md section 3): the strikes counting, the
 * stretched boss and its measure and percent (a fraction; with the quarter it fell in for a recovery goal), a
 * format-costs event's format and rate, an author-fares event's cost, and whether a lot is on offer. The memo's
 * story and fact sentences stay on the memo.
 */
export interface QuarterBrief {
  quarter: QuarterId;
  candidates: ReturnType<typeof getQ2Candidates>;
  brief: {
    strikes: number;
    stretch: { boss: BossId; measure: MeasureId; percent: number; line: string; recoveryFrom: QuarterId | null } | null;
    formatCost: { format: string; percent: number } | null;
    authorFare: number | null;
    lot: boolean;
  } | null;
}

/** Alma's record as the brief's numbers. `lastPlayed` is the quarter a recovery goal's measure fell in. */
export function briefOf(record: AlmaRecord, strikesCounting: number, lastPlayed: QuarterId): NonNullable<QuarterBrief['brief']> {
  const s = record.stretch;
  const line = !s ? null : record.drop !== undefined ? `${MEASURE_NAMES[s.measure].toUpperCase()} FELL ${record.drop}%. RESTORE IT.` : record.reason ?? null;
  return {
    strikes: strikesCounting,
    // A recovery goal's percent is the drop it restores, capped at the record's percent (the engine's goalsFor).
    stretch: s && line ? { boss: s.measure, measure: s.measure, percent: (record.drop !== undefined ? Math.min(record.drop, s.percent) : s.percent) / 100, line,
      recoveryFrom: record.drop !== undefined ? lastPlayed : null } : null,
    formatCost: record.type === 'format_costs' ? { format: String(record.params.format), percent: Number(record.params.percent) / 100 } : null,
    authorFare: record.type === 'author_fares' ? Number(record.params.cost) : null,
    // The Orbitplace lot is tier 2 (endless.md section 2): not built yet.
    lot: false,
  };
}

/** The brief for the quarter being planned, from Q2 on; null in Q1, or once no quarter is left to plan. */
export async function getQuarterBrief(request: Request): Promise<QuarterBrief | null> {
  const save = current(request);
  const quarter = quarterOf(save);
  if (!quarter || quarter === '2194-Q1') return null;
  const record = await recordFor(save, quarter);
  const counting = strikes(save.played.map(q => q.outcome.reportCard.plan.overall.score), 'next');
  return { quarter, candidates: getQ2Candidates(), brief: record ? briefOf(record, counting, save.played.at(-1)!.period) : null };
}

/**
 * Any quarter after Q1, as Q2 is played: a plan the player got wrong is a 400 naming the problem; from Q3 the
 * quarter's Alma record sets its event, and the engine plays it through simulateTurn. Q2 keeps its own path.
 */
export async function submitQuarterPlan(request: Request, plan: unknown, expected?: QuarterId): Promise<{ outcomeId: string }> {
  const started = performance.now();
  let quarter: QuarterId | null = null;
  try {
    refuseUnlessLocalPost(request);
    const save = current(request);
    quarter = quarterOf(save);
    if (quarter === '2194-Q1') throw new Response('Play the first quarter first.', { status: 409 });
    if (!quarter) throw alreadyPlayed();
    // A form names the quarter it was written for: one left open from Q3, sent once Q4 is open, mustn't play Q4
    // with July's picks. Its quarter is played already, so it's a 409, as for a repeat.
    if (expected !== undefined && expected !== quarter) throw alreadyPlayed();
    if (quarter === '2194-Q2') return submitQ2Plan(request, plan);
    const data = loadBookshop();
    const problem = q2PlanProblem(plan, data);
    if (problem) throw Response.json({ problem }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    const { picks, levers } = plan as Q2Plan;
    const canonical: Q2Plan = { picks: [...picks], levers: [...levers] };
    const record = await recordFor(save, quarter);
    if (!record) throw new SaveError('INVALID_SAVE');
    const turnEvent = { type: record.type, params: record.params, stretch: record.stretch, ...(record.drop === undefined ? {} : { drop: record.drop }) };
    const result = simulateTurn({ quarter, seed: save.seed, plan: canonical, event: turnEvent }, data) as Q2SimulationResult;
    // Later quarters' own discoveries (endless.md section 5) aren't built yet.
    const outcome: Q2GameOutcome = { ...result.outcome, discoveries: [] };
    if (JSON.stringify(outcome.plan) !== JSON.stringify(canonical)) throw new SaveError('INVALID_SAVE');
    const sales = visible(result.lines);
    const outcomeId = randomUUID();
    // The save read before Alma's wait may be stale: commit against the save as it is now.
    commit(current(request), { period: quarter as Exclude<QuarterId, '2194-Q1'>, outcomeId, outcome }, sales);
    event('game_quarter_committed', { quarter, leverCount: canonical.levers.length, pickCount: canonical.picks.filter(p => p !== null).length,
      units: sales.length, durationMs: performance.now() - started });
    return { outcomeId };
  } catch (error) {
    event('game_quarter_failed', { quarter: quarter ?? 'unknown', code: error instanceof SaveError ? error.code : error instanceof Response ? String(error.status) : 'INTERNAL_ERROR', durationMs: performance.now() - started });
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
/**
 * Reset, from Settings, at any point in the game: a new save from 1 January with a new seed, as Play again gives.
 * Returns its Set-Cookie value; the old save expires unused. Records how far the old game had got ("unknown" when
 * there was no readable save to start over from).
 */
export function resetGame(request: Request): string {
  try {
    refuseUnlessLocalPost(request);
    // A save that's missing or unreadable is what a reset is for: it starts over all the same (Audit, #173).
    let reached: string;
    try {
      reached = quarterOf(current(request))?.slice(5) ?? 'finished';
    } catch (error) {
      if (!(error instanceof SaveError) || !['MISSING_SAVE', 'INVALID_SAVE', 'REPLAY_MISMATCH'].includes(error.code)) throw error;
      reached = 'unknown';
    }
    const cookie = saveCookie(startGame(), request);
    event('game_reset', { quarter: reached });
    return cookie;
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
