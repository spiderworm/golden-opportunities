import { afterAll, describe, expect, it, vi } from 'vitest';
import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
const directory = await vi.hoisted(async () => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  return mkdtempSync(tmpdir() + '/replay-');
});
vi.mock('../platform/analytics/instance.server', () => ({ DATA_DIR: directory }));
vi.mock('../platform/analytics/analytics.server', () => ({ trackServer: vi.fn() }));
import { loadBookshop } from '../bookshop/loader.server';
import { runQuery } from '../query/run-query.server';
import { getOutcome, getQ2Candidates, resetGame, submitPlan, submitQ2Plan } from './game.server';
import { forgetReplays, linesHash, quarterLines, replayLines } from './replay.server';
import { getGameSession, queryViewForSave, saves } from './session.server';
import { SaveError } from './store.server';
import type { PlayedQuarter } from './types';

afterAll(() => rmSync(directory, { recursive: true, force: true }));
const request = (id: string, url = 'http://localhost/decide') => new Request(url, { method: 'POST', headers: { origin: 'http://localhost', cookie: 'orbital_save=' + id } });
const revenue = (id: string, quarter: string) =>
  runQuery({ measure: 'revenue', by: [], filter: { quarter: [quarter] } }, getGameSession(request(id)).queryView).total;
function played() {
  const save = saves.create(); const req = request(save.id);
  submitPlan(req, { levers: ['repick', 'events'] });
  submitQ2Plan(req, { picks: [getQ2Candidates()[0]!.isbn, null, null], levers: ['events'] });
  return save.id;
}

describe("a played quarter's lines (endless.md section 9, how quarters are kept)", () => {
  it('are kept as a hash and a count, not the lines, so a save stays small', () => {
    const id = played();
    const save = saves.read(id);
    for (const quarter of save.played) {
      expect(quarter).not.toHaveProperty('sales');
      expect(quarter.lines).toEqual({ hash: expect.stringMatching(/^[0-9a-f]{64}$/), count: quarter.outcome.totals.plan.units });
    }
    // Two quarters' lines were about 4 MB as stored; now the whole save is a few tens of KB.
    expect(readFileSync(path.join(directory, 'saves', id + '.json')).length).toBeLessThan(200_000);
  });

  it('are replayed from the plan and the seed, and give the same ledger as when they were played', () => {
    const id = played();
    const before = ['2194-Q1', '2194-Q2'].map(q => revenue(id, q));
    forgetReplays();
    const after = ['2194-Q1', '2194-Q2'].map(q => revenue(id, q));
    expect(after).toEqual(before);
    expect(after[0]).toBeCloseTo(getOutcome(request(id))!.totals.plan.revenue, 6);
    expect(after[1]).toBeCloseTo(getOutcome(request(id), '2194-Q2')!.totals.plan.revenue, 6);
    const save = saves.read(id);
    for (const quarter of save.played) expect(linesHash(replayLines(quarter, save.seed, loadBookshop()))).toBe(quarter.lines!.hash);
  });

  it('refuse loudly when a replay no longer matches (an engine change), and a reset recovers', () => {
    const id = played();
    const save = saves.read(id);
    saves.update(id, save.revision, draft => { draft.played[1] = { ...draft.played[1]!, lines: { ...draft.played[1]!.lines!, hash: '0'.repeat(64) } } as PlayedQuarter; });
    forgetReplays();
    expect(() => queryViewForSave(saves.read(id))).toThrow(expect.objectContaining({ code: 'REPLAY_MISMATCH' }));
    // Never silently rescored: the count is checked too.
    const counted = { ...saves.read(id).played[0]!, lines: { ...saves.read(id).played[0]!.lines!, count: 1 } } as PlayedQuarter;
    expect(() => quarterLines(id, save.seed, counted, loadBookshop)).toThrow(SaveError);
    const fresh = resetGame(request(id, 'http://localhost/settings/reset'));
    expect(fresh).toMatch(/orbital_save=/);
  });

  it("read an older save's stored lines as they are, without replaying", () => {
    const id = played();
    const save = saves.read(id);
    const stored = replayLines(save.played[0]!, save.seed, loadBookshop());
    // An older save, as written before: the lines themselves, no hash.
    saves.update(id, save.revision, draft => { const { lines: _, ...rest } = draft.played[0]!; draft.played[0] = { ...rest, sales: stored } as PlayedQuarter; });
    const older = saves.read(id);
    expect(older.played[0]).toHaveProperty('sales');
    expect(quarterLines(id, older.seed, older.played[0]!, () => { throw new Error('replayed'); })).toBe(older.played[0]!.sales);
    expect(revenue(id, '2194-Q1')).toBeCloseTo(getOutcome(request(id))!.totals.plan.revenue, 6);
  });

  it('refuses a quarter with both forms, or a malformed hash', () => {
    const id = played();
    const save = saves.read(id);
    const both = (draft: typeof save) => { draft.played[0] = { ...draft.played[0]!, sales: [] } as never; };
    expect(() => saves.update(id, save.revision, both)).toThrow(expect.objectContaining({ code: 'INVALID_SAVE' }));
    const badHash = (draft: typeof save) => { draft.played[0] = { ...draft.played[0]!, lines: { hash: 'nope', count: draft.played[0]!.lines!.count } } as PlayedQuarter; };
    expect(() => saves.update(id, saves.read(id).revision, badHash)).toThrow(expect.objectContaining({ code: 'INVALID_SAVE' }));
  });
});

describe('a save whose replay no longer matches', () => {
  it("still opens the shell (date, alerts, standing order) and Settings, so Reset game can be reached (Plot, #198)", async () => {
    const { getStationState } = await import('../shell/station-state');
    const id = played();
    const save = saves.read(id);
    saves.update(id, save.revision, draft => { draft.played[0] = { ...draft.played[0]!, lines: { ...draft.played[0]!.lines!, hash: 'f'.repeat(64) } } as PlayedQuarter; });
    forgetReplays();
    const req = request(id, 'http://localhost/settings');
    expect(getStationState(req)).toMatchObject({ date: '2194-07-01', standingOrder: { quarter: null } });
    // Only what needs the lines refuses, and only when it reads them.
    const session = getGameSession(req);
    expect(session.save.id).toBe(id);
    expect(() => session.queryView).toThrow(expect.objectContaining({ code: 'REPLAY_MISMATCH' }));
  });
});
