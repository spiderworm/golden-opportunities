import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { rmSync } from 'node:fs';
const directory = await vi.hoisted(async () => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  return mkdtempSync(tmpdir() + '/endless-');
});
vi.mock('../platform/analytics/instance.server', () => ({ DATA_DIR: directory }));
vi.mock('../platform/analytics/analytics.server', () => ({ trackServer: vi.fn() }));
import { runQuery } from '../query/run-query.server';
import { getQ2Candidates, getQuarterBrief, submitPlan, submitQ2Plan, submitQuarterPlan } from './game.server';
import { forgetReplays } from './replay.server';
import { currentQuarter, isFinished } from './progress';
import { PLAYABLE_QUARTERS, setPlayableQuarters } from './quarters';
import { getResultData } from './results.server';
import { getGameSession, saves } from './session.server';
import type { Q2Plan } from '../simulation/types';

// The endless loop (endless.md), played before it's switched on: the game plays six quarters here, two in play.
beforeAll(() => setPlayableQuarters(6));
afterAll(() => { setPlayableQuarters(PLAYABLE_QUARTERS); rmSync(directory, { recursive: true, force: true }); });
afterEach(() => vi.clearAllMocks());
const request = (id: string, url = 'http://localhost/decide') => new Request(url, { method: 'POST', headers: { origin: 'http://localhost', cookie: 'orbital_save=' + id } });
const hold: Q2Plan = { picks: [null, null, null], levers: [] };

// Each later quarter computes its anchor (about 40 holding-course runs, Sim's #201), so these take a few seconds.
describe('quarters past Q2', { timeout: 30_000 }, () => {
  it('play through simulateTurn under Alma\'s record, and replay to the same ledger', async () => {
    const save = saves.create(); const req = request(save.id);
    submitPlan(req, { levers: ['repick', 'events'] });
    submitQ2Plan(req, { picks: [getQ2Candidates()[0]!.isbn, null, null], levers: ['events'] });
    expect(currentQuarter(saves.read(save.id))).toBe('2194-Q3');
    // Decide's brief: Alma's event for Q3 (scripted under test), its numbers for Plot's templates.
    const brief = (await getQuarterBrief(req))!;
    expect(brief.quarter).toBe('2194-Q3');
    expect(brief.brief).toMatchObject({ strikes: expect.any(Number), lot: false });
    const record = saves.read(save.id).alma!.find(r => r.quarter === '2194-Q3')!;
    expect(record.source).toBe('scripted');
    await submitQuarterPlan(req, { picks: [getQ2Candidates()[1]!.isbn, null, null], levers: ['events'] });
    const after = saves.read(save.id);
    expect(after.played.map(q => q.period)).toEqual(['2194-Q1', '2194-Q2', '2194-Q3']);
    expect(after.played[2]!.lines).toEqual({ hash: expect.stringMatching(/^[0-9a-f]{64}$/), count: after.played[2]!.outcome.totals.plan.units });
    expect(after.played[2]!.outcome).toMatchObject({ quarter: '2194-Q3', discoveries: [] });
    // Its sales are in the ledger as July to September 2194, and a cold replay (under the record's event) gives the same.
    const q3 = () => runQuery({ measure: 'revenue', by: [], filter: { quarter: ['2194-Q3'] } }, getGameSession(req).queryView).total;
    const warm = q3();
    expect(warm).toBeCloseTo(after.played[2]!.outcome.totals.plan.revenue, 6);
    forgetReplays();
    expect(q3()).toBe(warm);
    // The result screen's data, for any quarter.
    const result = getResultData(req)!;
    expect(result).toMatchObject({ quarter: '2194-Q3', lastYearLabel: 'Q3 2193', referenceLabel: 'Q2 2194', next: '2194-Q4', canPlayAgain: false, removed: null });
    expect(result.record.map(r => r.quarter)).toEqual(['2194-Q1', '2194-Q2', '2194-Q3']);
    expect(result.record[2]!.event).toEqual({ type: record.type, params: record.params });
    expect(result.record[0]!.event).toBeNull();
    // The season note and the goals note's stretch, from the 2193 ledger and Q3's record.
    expect(result.season2193).toMatchObject({ quarter: expect.any(Number), before: expect.any(Number), beforeLabel: 'Q2 2193' });
    expect(result.season2193.quarter).toBeCloseTo(274036.165, 3);
    expect(result.goalStretch).toEqual(record.stretch ? { measure: record.stretch.measure, percent: (record.drop ?? record.stretch.percent) / 100, recoveryFrom: record.drop !== undefined ? '2194-Q2' : null } : null);
  });

  it('end when the panel removes the player: three strikes in any four quarters', async () => {
    const save = saves.create(); const req = request(save.id);
    submitPlan(req, { levers: ['sale'] });
    submitQ2Plan(req, { picks: [null, null, null], levers: ['sale'] });
    await submitQuarterPlan(req, { ...hold, levers: ['sale'] });
    const s = saves.read(save.id);
    expect(s.played.map(q => q.outcome.reportCard.plan.overall.score < 70)).toEqual([true, true, true]);
    expect(currentQuarter(s)).toBeNull();
    expect(isFinished(s)).toBe(true);
    const result = getResultData(req)!;
    expect(result).toMatchObject({ next: null, canPlayAgain: true, removed: { at: '2194-Q3' } });
    expect(result.removed!.strikes.map(x => x.quarter)).toEqual(['2194-Q1', '2194-Q2', '2194-Q3']);
    // No quarter is left to plan, and none can be played.
    expect(await getQuarterBrief(req)).toBeNull();
    await expect(submitQuarterPlan(req, hold)).rejects.toMatchObject({ status: 409 });
  });

  it("refuse a form written for another quarter: one left open from Q2, sent once Q3 is open, doesn't play Q3", async () => {
    const save = saves.create(); const req = request(save.id);
    submitPlan(req, { levers: [] });
    submitQ2Plan(req, hold);
    await expect(submitQuarterPlan(req, hold, '2194-Q2')).rejects.toMatchObject({ status: 409 });
    expect(saves.read(save.id).played).toHaveLength(2);
    await submitQuarterPlan(req, hold, '2194-Q3');
    expect(saves.read(save.id).played).toHaveLength(3);
  });

  it('refuse a plan the player got wrong with Q2\'s 400, and a quarter out of turn with a 409', async () => {
    const save = saves.create(); const req = request(save.id);
    await expect(submitQuarterPlan(req, hold)).rejects.toMatchObject({ status: 409 });
    submitPlan(req, { levers: [] });
    submitQ2Plan(req, hold);
    const bad = await submitQuarterPlan(req, { picks: ['nope', null, null], levers: [] }).catch((e: Response) => e);
    expect((bad as Response).status).toBe(400);
    expect(await (bad as Response).json()).toEqual({ problem: 'unknown-edition' });
  });
});
