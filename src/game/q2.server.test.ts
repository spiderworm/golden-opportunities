import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const directory = await vi.hoisted(async () => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  return mkdtempSync(tmpdir() + '/orbital-q2-');
});
vi.mock('../platform/analytics/instance.server', () => ({ DATA_DIR: directory }));
vi.mock('../platform/analytics/analytics.server', () => ({ trackServer: vi.fn() }));
import { currentQuarter, getOutcome, getPlan, getQ2Candidates, markAlertSeen, startNewGame, submitPlan, submitQ2Plan } from './game.server';
import { getResultData } from './results.server';
import { getGameSession, saves } from './session.server';
import { runQuery } from '../query/run-query.server';
import { getStationState } from '../shell/station-state';
import { trackServer } from '../platform/analytics/analytics.server';
import type { Q2Plan } from '../simulation/types';

function request(id?: string, method = 'POST', origin = 'http://localhost') {
  return new Request('http://localhost/decide', { method, headers: { origin, ...(id ? { cookie: 'orbital_save=' + id } : {}) } });
}
async function refusal(action: () => unknown, code: number): Promise<Response> {
  try { action(); } catch (e) { expect(e).toBeInstanceOf(Response); expect((e as Response).status).toBe(code); return e as Response; }
  throw new Error('Expected refusal');
}
const candidates = getQ2Candidates();
const byTitle = (title: string, format: string) => candidates.find(c => c.title === title && c.format === format)!.isbn;
const quiet: Q2Plan = { picks: [byTitle('Land Water Sky Space', 'Hardcover'), byTitle('Thatchwork Cottage', 'Hardcover'), byTitle('Kalakalal Avenue', 'Hardcover')], levers: ['events'] };
afterEach(() => vi.clearAllMocks());
afterAll(() => rmSync(directory, { recursive: true, force: true }));

describe('the second quarter', () => {
  it('plays Q1, then Q2, advancing the date and the visible quarters, one plan per quarter', async () => {
    const save = saves.create(); const req = request(save.id);
    expect(currentQuarter(req)).toBe('2194-Q1'); expect(getGameSession(req).date).toBe('2194-01-01');
    await refusal(() => submitQ2Plan(req, quiet), 409);
    submitPlan(req, { levers: ['repick', 'events'] });
    expect(currentQuarter(req)).toBe('2194-Q2'); expect(getGameSession(req).date).toBe('2194-04-01');
    await refusal(() => submitPlan(req, { levers: [] }), 409);
    expect(getPlan(req, '2194-Q2')).toBeNull(); expect(getOutcome(req, '2194-Q2')).toBeNull();

    const { outcomeId } = submitQ2Plan(req, quiet);
    expect(outcomeId).toMatch(/^[a-f0-9-]{36}$/);
    expect(currentQuarter(req)).toBeNull(); expect(getGameSession(req).date).toBe('2194-07-01');
    expect(getPlan(req, '2194-Q2')).toEqual(quiet);
    expect(getPlan(req)).toEqual({ levers: ['repick', 'events'] });
    const q2 = getOutcome(req, '2194-Q2')!;
    expect(q2.quarter).toBe('2194-Q2'); expect(q2.discoveries).toEqual([]);
    const stored = saves.read(save.id);
    expect(stored.played.map(q => q.period)).toEqual(['2194-Q1', '2194-Q2']);
    expect(stored.played[1]!.sales).toHaveLength(q2.totals.plan.units);
    expect(runQuery({ measure: 'revenue', by: [], filter: { quarter: ['2194-Q2'] } }, getGameSession(req).queryView).total).toBeCloseTo(q2.totals.plan.revenue, 6);
    await refusal(() => submitQ2Plan(req, quiet), 409);
    expect(trackServer).toHaveBeenCalledWith('game_quarter_committed', { quarter: 'Q2', leverCount: 1, pickCount: 3, units: q2.totals.plan.units, durationMs: expect.any(Number) });
    expect(JSON.stringify(vi.mocked(trackServer).mock.calls)).not.toContain(quiet.picks[0]!);
  });

  it("refuses a Q2 plan the player got wrong with a 400 that names the problem, and writes nothing", async () => {
    const save = saves.create(); const req = request(save.id);
    submitPlan(req, { levers: [] });
    const twoEditions = candidates.find(c => candidates.some(d => d.bookId === c.bookId && d.isbn !== c.isbn))!;
    const sibling = candidates.find(d => d.bookId === twoEditions.bookId && d.isbn !== twoEditions.isbn)!;
    for (const [plan, problem] of [[{ picks: [null, null], levers: [] }, 'shape'], [{ picks: ['000', null, null], levers: [] }, 'unknown-edition'],
      [{ picks: [twoEditions.isbn, sibling.isbn, null], levers: [] }, 'same-title'], [{ picks: [null, null, null], levers: ['repick'] }, 'shape']] as const) {
      const response = await refusal(() => submitQ2Plan(req, plan), 400);
      expect(await response.json()).toEqual({ problem });
    }
    expect(saves.read(save.id).played).toHaveLength(1);
    // During Q1, any Q2 plan is out of turn, well formed or not.
    const early = saves.create();
    await refusal(() => submitQ2Plan(request(early.id), { picks: [null], levers: [] }), 409);
    await refusal(() => submitQ2Plan(request(save.id, 'GET'), quiet), 405);
    await refusal(() => submitQ2Plan(request(save.id, 'POST', 'http://evil.example'), quiet), 403);
  });

  it('takes a Q2 plan whatever order its keys arrive in, and stores it in the engine\'s order', () => {
    const save = saves.create(); const req = request(save.id);
    submitPlan(req, { levers: [] });
    submitQ2Plan(req, JSON.parse(JSON.stringify({ levers: quiet.levers, picks: quiet.picks })));
    expect(Object.keys(getPlan(req, '2194-Q2')!)).toEqual(['picks', 'levers']);
    expect(getPlan(req, '2194-Q2')).toEqual(quiet);
  });

  it('gives the result screen each quarter, then the half-year review as the mean, rounded half up', () => {
    const save = saves.create(); const req = request(save.id);
    expect(getResultData(req)).toBeNull();
    submitPlan(req, { levers: ['repick', 'events'] });
    const q1 = getResultData(req)!;
    expect(q1).toMatchObject({ quarter: '2194-Q1', next: '2194-Q2', canPlayAgain: false, halfYear: null });
    expect(q1.reference.map(r => r.month)).toEqual(['2193-10', '2193-11', '2193-12']);
    // Q4 2193 is the memo's $161,525.
    expect(Math.round(q1.previousQuarter)).toBe(161525); expect(q1.sameQuarterLastYear).toBeGreaterThan(0);
    expect(getResultData(req, '2194-Q2')).toBeNull();

    submitQ2Plan(req, { picks: [null, null, null], levers: [] });
    const q2 = getResultData(req)!;
    if (q2.quarter !== '2194-Q2') throw new Error('Expected Q2');
    const q1Outcome = getOutcome(req)!;
    expect(q2).toMatchObject({ next: null, canPlayAgain: true });
    expect(q2.previousQuarter).toBeCloseTo(q1Outcome.totals.plan.revenue, 6);
    expect(q2.reference.map(r => r.month)).toEqual(['2194-01', '2194-02', '2194-03']);
    const scores = [q1Outcome.reportCard.plan.overall.score, q2.outcome.reportCard.plan.overall.score];
    expect(q2.halfYear).toMatchObject({ score: Math.floor((scores[0]! + scores[1]!) / 2 + 0.5) });
    expect(q2.halfYear!.quarters.map(q => [q.quarter, q.overall.score, q.measures.length])).toEqual([['2194-Q1', scores[0], 4], ['2194-Q2', scores[1], 4]]);
    expect(getResultData(req, '2194-Q1')).toMatchObject({ quarter: '2194-Q1', next: null, canPlayAgain: true });
  });

  it('starts a new game only once the half year is played, under the same origin rules', async () => {
    const save = saves.create(); const req = request(save.id);
    await refusal(() => startNewGame(req), 409);
    submitPlan(req, { levers: [] }); await refusal(() => startNewGame(req), 409);
    submitQ2Plan(req, { picks: [null, null, null], levers: [] });
    await refusal(() => startNewGame(request(save.id, 'GET')), 405);
    await refusal(() => startNewGame(request(save.id, 'POST', 'http://evil.example')), 403);
    const cookie = startNewGame(req);
    const id = /^orbital_save=([A-Za-z0-9_-]{43});/.exec(cookie)![1]!;
    expect(id).not.toBe(save.id);
    const fresh = saves.read(id);
    expect(fresh).toMatchObject({ played: [], discoveries: [], revision: 0 });
    expect(currentQuarter(request(id))).toBe('2194-Q1');
    expect(saves.read(save.id).played).toHaveLength(2);
  });

  it("keeps each quarter's memo and standing order, folding the old Q1 flag in", () => {
    const save = saves.create(); const req = request(save.id);
    expect(getStationState(req)).toMatchObject({ standingOrder: { quarter: '2194-Q1', seen: false, submitted: false }, q1: null, alerts: [{ id: 'q4-revenue-down', unread: true }] });
    markAlertSeen(req);
    submitPlan(req, { levers: [] });
    const q2 = getStationState(req);
    expect(q2.standingOrder).toEqual({ quarter: '2194-Q2', seen: false, submitted: false });
    expect(q2.alerts.map(a => [a.id, a.unread])).toEqual([['q2-calendar-empty', true], ['q4-revenue-down', false]]);
    expect(q2.q1).toEqual(expect.objectContaining({ score: expect.any(Number), grade: expect.any(String), binding: expect.any(Array) }));
    const revision = saves.read(save.id).revision;
    markAlertSeen(req); markAlertSeen(req);
    expect(saves.read(save.id)).toMatchObject({ alertsSeen: ['2194-Q1', '2194-Q2'], revision: revision + 1 });
    expect(getStationState(req).standingOrder).toEqual({ quarter: '2194-Q2', seen: true, submitted: false });
    submitQ2Plan(req, { picks: [null, null, null], levers: [] });
    expect(getStationState(req).standingOrder).toEqual({ quarter: null, seen: true, submitted: true });

    // A save marked with the old flag: Q1's memo stays seen, and the flag folds into the list.
    const legacy = saves.create(); const file = path.join(directory, 'saves', legacy.id + '.json');
    writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), alertSeen: true }));
    submitPlan(request(legacy.id), { levers: [] });
    expect(getStationState(request(legacy.id)).alerts.map(a => a.unread)).toEqual([true, false]);
    markAlertSeen(request(legacy.id));
    const folded = saves.read(legacy.id);
    expect(folded.alertSeen).toBeUndefined(); expect(folded.alertsSeen).toEqual(['2194-Q1', '2194-Q2']);
  });

  it('refuses saves whose quarters or memo list are out of order', () => {
    const save = saves.create(); const req = request(save.id);
    submitPlan(req, { levers: [] }); submitQ2Plan(req, { picks: [null, null, null], levers: [] });
    const file = path.join(directory, 'saves', save.id + '.json');
    const good = JSON.parse(readFileSync(file, 'utf8'));
    for (const bad of [{ ...good, played: [good.played[1]] }, { ...good, played: [good.played[1], good.played[0]] },
      { ...good, played: [good.played[0], { ...good.played[1], outcome: good.played[0].outcome }] },
      { ...good, played: [good.played[0], { ...good.played[1], outcome: { ...good.played[1].outcome, discoveries: ['A', 'A'] } }] },
      { ...good, alertsSeen: ['2194-Q2', '2194-Q1'] }, { ...good, alertsSeen: ['2194-Q3'] }]) {
      writeFileSync(file, JSON.stringify(bad));
      expect(() => saves.read(save.id)).toThrow('INVALID_SAVE');
    }
    writeFileSync(file, JSON.stringify({ ...good, alertsSeen: ['2194-Q2'] }));
    expect(saves.read(save.id).alertsSeen).toEqual(['2194-Q2']);
  });

  it("keeps each year's months apart once the player's 2194 joins the ledgers (Probe, #151)", () => {
    const save = saves.create(); const req = request(save.id);
    submitPlan(req, { levers: [] });
    const view = getGameSession(req).queryView;
    const rows = runQuery({ measure: 'units', by: ['month'] }, view).rows;
    const units = (month: string) => rows.find(r => r.month === month)?.units;
    const only = (quarter: string) => runQuery({ measure: 'units', by: [], filter: { quarter: [quarter], month: [`${quarter.slice(0, 4)}-01`] } }, view).total;
    expect(rows.map(r => r.month).slice(0, 4)).toEqual(['2193-01', '2193-02', '2193-03', '2193-04']);
    expect(units('2193-01')).toBe(only('2193-Q1')); expect(units('2194-01')).toBe(only('2194-Q1'));
    expect(rows.at(-1)?.month).toBe('2194-03');
    expect(() => runQuery({ measure: 'units', by: [], filter: { month: ['01'] } }, view)).toThrow('Month filters are year and month, like 2193-04.');
  });
});
