import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const directory = await vi.hoisted(async () => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  return mkdtempSync(tmpdir() + '/orbital-play-');
});
vi.mock('../platform/analytics/instance.server', () => ({ DATA_DIR: directory }));
vi.mock('../platform/analytics/analytics.server', () => ({ trackServer: vi.fn() }));
import { getOutcome, getPlan, submitPlan } from './game.server';
import { getGameSession, saves, queryViewForSave } from './session.server';
import { createSaveStore } from './store.server';
import { runQuery } from '../query/run-query.server';
import * as simulation from '../simulation/simulate';
import type { Plan } from '../simulation/types';
import { trackServer } from '../platform/analytics/analytics.server';
import { createQueryHandler } from '../query/http.server';
import { issueGameQueryToken } from './query-token.server';
import { action as decideAction, loader as decideLoader } from '../decide/route';
import { loader as resultLoader } from '../result/route';
import type { Route as DecideRoute } from '../decide/+types/route';
import type { Route as ResultRoute } from '../result/+types/route';

const query = { measure: 'revenue', by: [], filter: { quarter: ['2194-Q1'] } };
function request(id?: string, method = 'POST', origin = 'http://localhost') {
  return new Request('http://localhost/decide', { method, headers: { origin, ...(id ? { cookie: 'orbital_save=' + id } : {}) } });
}
function status(action: () => unknown, code: number) {
  try { action(); throw new Error('Expected refusal'); } catch (e) { expect(e).toBeInstanceOf(Response); expect((e as Response).status).toBe(code); }
}
afterEach(() => vi.restoreAllMocks());
afterAll(() => rmSync(directory, { recursive: true, force: true }));

describe('persisted quarter transaction', () => {
  it('commits the plan, real outcome and visible lines together, surviving a reopened store', () => {
    const save = saves.create(); const other = saves.create(); const req = request(save.id);
    saves.update(save.id, 0, s => { s.discoveries = ['A']; });
    expect(getPlan(req)).toBeNull(); expect(getOutcome(req)).toBeNull();
    expect(runQuery(query, getGameSession(req).queryView).total).toBe(0);
    const { outcomeId } = submitPlan(req, { levers: ['repick', 'events'] });
    const outcome = getOutcome(req)!;
    expect(outcomeId).toMatch(/^[a-f0-9-]{36}$/);
    expect(outcome.plan).toEqual({ levers: ['repick', 'events'] });
    expect(outcome.discoveries).toEqual(['A']);
    expect(getPlan(req)).toEqual(outcome.plan);
    const reopened = createSaveStore(path.join(directory, 'saves')).read(save.id);
    expect(reopened.played[0]).toMatchObject({ period: '2194-Q1', outcomeId, outcome });
    expect(reopened.revision).toBe(2);
    expect(reopened.played[0].sales).toHaveLength(outcome.totals.plan.units);
    expect(runQuery(query, queryViewForSave(reopened)).total).toBeCloseTo(outcome.totals.plan.revenue, 6);
    expect(getGameSession(req).date).toBe('2194-04-01');
    expect(getOutcome(request(other.id))).toBeNull();
    expect(runQuery(query, getGameSession(request(other.id)).queryView).total).toBe(0);
    expect(getGameSession(request(other.id)).date).toBe('2194-01-01');
    const disk = readFileSync(path.join(directory, 'saves', save.id + '.json'), 'utf8');
    expect(disk).not.toContain('doNothingLines');
    expect(disk).not.toContain('listPrice');
    const spy = vi.spyOn(simulation, 'simulateQuarter');
    getOutcome(req); getPlan(req);
    status(() => submitPlan(req, { levers: [] }), 409);
    expect(spy).not.toHaveBeenCalled();
    expect(saves.read(save.id)).toEqual(reopened);
  });

  it('refuses missing saves, unsafe callers and invalid plans before simulation', () => {
    const save = saves.create(); const spy = vi.spyOn(simulation, 'simulateQuarter');
    status(() => submitPlan(request(), { levers: [] }), 401);
    status(() => getOutcome(request('z'.repeat(43))), 401);
    status(() => submitPlan(request(save.id, 'GET'), { levers: [] }), 405);
    status(() => submitPlan(request(save.id, 'POST', 'https://evil.example'), { levers: [] }), 403);
    for (const plan of [{ option: 'A' }, { levers: ['sale', 'events'] }, { levers: ['sale', 'sale'] }, { levers: [], saveId: save.id }]) {
      status(() => submitPlan(request(save.id), plan as unknown as Plan), 400);
    }
    expect(spy).not.toHaveBeenCalled();
    expect(saves.read(save.id)).toEqual(save);
  });

  it('leaves all state unchanged when the engine fails', () => {
    const save = saves.create();
    vi.spyOn(simulation, 'simulateQuarter').mockImplementation(() => { throw new Error('private detail'); });
    status(() => submitPlan(request(save.id), { levers: [] }), 500);
    expect(saves.read(save.id)).toEqual(save);
    expect(getOutcome(request(save.id))).toBeNull();
  });

  it('does not overwrite a concurrent winning transaction', () => {
    const save = saves.create(); const req = request(save.id);
    const real = simulation.simulateQuarter;
    vi.spyOn(simulation, 'simulateQuarter').mockImplementationOnce((...args) => {
      submitPlan(req, { levers: ['events'] });
      return real(...args);
    });
    status(() => submitPlan(req, { levers: ['sale'] }), 409);
    expect(getPlan(req)).toEqual({ levers: ['events'] });
    expect(saves.read(save.id).revision).toBe(1);
  });

  it('reads version 1 saves as per-quarter results, and writes them back as version 2', () => {
    const save = saves.create(); const req = request(save.id);
    const { outcomeId } = submitPlan(req, { levers: ['events'] });
    const outcome = getOutcome(req)!;
    const file = path.join(directory, 'saves', save.id + '.json');
    const current = JSON.parse(readFileSync(file, 'utf8'));
    const { outcomeId: _id, outcome: _outcome, ...quarter } = current.played[0];
    const v1 = { ...current, version: 1, played: [quarter], completion: { outcomeId, outcome } };
    writeFileSync(file, JSON.stringify(v1));
    expect(saves.read(save.id).played[0]).toEqual({ ...quarter, outcomeId, outcome });
    expect(getOutcome(req)).toEqual(outcome); expect(getPlan(req)).toEqual({ levers: ['events'] });
    status(() => submitPlan(req, { levers: [] }), 409);
    expect(JSON.parse(readFileSync(file, 'utf8')).version).toBe(1);
    saves.update(save.id, v1.revision, () => {});
    const written = JSON.parse(readFileSync(file, 'utf8'));
    expect(written.version).toBe(2); expect(written.completion).toBeUndefined(); expect(written.played[0].outcomeId).toBe(outcomeId);

    const unplayed = saves.create(); const unplayedFile = path.join(directory, 'saves', unplayed.id + '.json');
    writeFileSync(unplayedFile, JSON.stringify({ ...unplayed, version: 1 }));
    expect(saves.read(unplayed.id)).toEqual(unplayed);
    // The game never wrote a quarter without its result, or a result without its quarter.
    writeFileSync(unplayedFile, JSON.stringify({ ...v1, id: unplayed.id, completion: undefined }));
    expect(() => saves.read(unplayed.id)).toThrow('INVALID_SAVE');
    writeFileSync(unplayedFile, JSON.stringify({ ...v1, id: unplayed.id, played: [] }));
    expect(() => saves.read(unplayed.id)).toThrow('INVALID_SAVE');
  });

  it('fails closed on a corrupt persisted outcome', () => {
    const save = saves.create(); const req = request(save.id);
    submitPlan(req, { levers: [] });
    const file = path.join(directory, 'saves', save.id + '.json');
    const corrupted = JSON.parse(readFileSync(file, 'utf8'));
    corrupted.played[0].outcome.reportCard.plan.overall.score = 'untrusted';
    writeFileSync(file, JSON.stringify(corrupted));
    status(() => getOutcome(req), 500);
  });

  it('records commit telemetry without save IDs, seeds, outcomes or plan text', () => {
    vi.mocked(trackServer).mockClear();
    const save = saves.create(); submitPlan(request(save.id), { levers: [] });
    expect(trackServer).toHaveBeenCalledWith('game_quarter_committed', { leverCount: 0, units: expect.any(Number), durationMs: expect.any(Number) });
    const logged = JSON.stringify(vi.mocked(trackServer).mock.calls);
    expect(logged).not.toContain(save.id);
    expect(logged).not.toContain('seed'); expect(logged).not.toContain('outcome');
  });
});

it('runs the Decide and Result route loop against the same cookie-owned save', async () => {
  const save = saves.create();
  const args = { request: request(save.id, 'GET') };
  expect(decideLoader(args as DecideRoute.LoaderArgs)).toBeNull();
  try { resultLoader(args as ResultRoute.LoaderArgs); throw Error('Expected redirect'); }
  catch (e) { expect(e).toBeInstanceOf(Response); expect((e as Response).headers.get('location')).toBe('/decide'); }
  const post = () => ({ request: new Request('http://localhost/decide', { method: 'POST', headers: {
    origin: 'http://localhost', cookie: 'orbital_save=' + save.id, 'content-type': 'application/x-www-form-urlencoded',
  }, body: 'levers=events' }) } as DecideRoute.ActionArgs);
  expect(await decideAction(post())).toEqual({ ok: true });
  expect(await decideAction(post())).toMatchObject({ init: { status: 409 }, data: { ok: false } });
  try { decideLoader(args as DecideRoute.LoaderArgs); throw Error('Expected redirect'); }
  catch (e) { expect(e).toBeInstanceOf(Response); expect((e as Response).headers.get('location')).toBe('/result'); }
  const result = resultLoader(args as ResultRoute.LoaderArgs);
  expect(result.outcome.plan).toEqual({ levers: ['events'] });
  expect(result.reference).toHaveLength(3);
  expect(result.lastQ1).toBeCloseTo(95245.8078, 4);
  expect(result.outcome).not.toHaveProperty('seed');
});

it('serves committed facts through the browser API and ends pre-play agent capabilities', async () => {
  const save = saves.create(); const other = saves.create();
  const capability = issueGameQueryToken(save.id);
  const handler = createQueryHandler({ track: () => {} });
  const lookup = (id: string, token?: string) => handler(new Request('http://localhost/api/query', { method: 'POST', headers: {
    origin: 'http://localhost', cookie: 'orbital_save=' + id, 'content-type': 'application/json',
    ...(token ? { authorization: 'Bearer ' + token } : {}),
  }, body: JSON.stringify(query) }));
  try {
    expect((await (await lookup(save.id)).json()).total).toBe(0);
    submitPlan(request(save.id), { levers: ['sale'] });
    expect((await (await lookup(save.id)).json()).total).toBeCloseTo(getOutcome(request(save.id))!.totals.plan.revenue, 6);
    expect((await (await lookup(other.id)).json()).total).toBe(0);
    const ended = await lookup(save.id, capability.token);
    expect(ended.status).toBe(401);
    expect((await ended.json()).error.code).toBe('SESSION_ENDED');
  } finally { capability.revoke(); }
});
