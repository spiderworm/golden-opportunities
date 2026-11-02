import { afterAll, describe, expect, it, onTestFinished, vi } from 'vitest';
import { rmSync } from 'node:fs';
const directory = await vi.hoisted(async () => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  return mkdtempSync(tmpdir() + '/data-version-');
});
vi.mock('../platform/analytics/instance.server', () => ({ DATA_DIR: directory }));
vi.mock('../platform/analytics/analytics.server', () => ({ trackServer: vi.fn() }));
import { markAlertSeen, resetGame, startNewGame, submitPlan, submitQ2Plan } from '../game/game.server';
import { recordDiscoveries } from '../game/discoveries.server';
import { getGameSession, saves } from '../game/session.server';
import { getStationState } from '../shell/station-state';
import { PLAYABLE_QUARTERS, setPlayableQuarters } from '../game/quarters';
import { createQueryHandler } from './http.server';
import { DATA_VERSION_HEADER, dataVersion } from './data-version.server';
import { EVIDENCE_HEADER } from './types';
import { forgetResults, resultCacheSize, runQuery, setResultCacheLimits } from './run-query.server';
import { pendingTurn } from '../alma/hook.server';
import { validateView } from './view.server';

afterAll(() => rmSync(directory, { recursive: true, force: true }));
const request = (id: string, url = 'http://localhost/decide') =>
  new Request(url, { method: 'POST', headers: { origin: 'http://localhost', cookie: 'orbital_save=' + id } });
const version = (id: string) => getStationState(request(id)).dataVersion;
const idOf = (setCookie: string) => /orbital_save=([^;]+)/.exec(setCookie)![1]!;

describe("a save's data version", () => {
  it('is short and opaque: a hash, never the save ID', () => {
    const save = saves.create();
    expect(version(save.id)).toMatch(/^[0-9a-f]{16}$/);
    expect(version(save.id)).not.toContain(save.id.slice(0, 8));
    expect(version(save.id)).toBe(dataVersion(saves.read(save.id)));
  });

  it('changes on every plan commit, and only then within a game', () => {
    const save = saves.create(); const req = request(save.id);
    const start = version(save.id);
    const revision = saves.read(save.id).revision;
    // Writes that don't change what queries see keep it: the memo, discovery evidence.
    markAlertSeen(req);
    const { save: current, queryView } = getGameSession(req);
    const query = { measure: 'avg_rating' as const, by: ['title' as const] };
    recordDiscoveries(current, queryView, [{ query, result: runQuery(query, queryView) }]);
    // The save did change (its storage revision moved), but not what its queries see.
    expect(saves.read(save.id).revision).toBeGreaterThan(revision);
    expect(version(save.id)).toBe(start);
    submitPlan(req, { levers: [] });
    const afterQ1 = version(save.id);
    expect(afterQ1).not.toBe(start);
    submitQ2Plan(req, { picks: [null, null, null], levers: [] });
    expect(new Set([start, afterQ1, version(save.id)]).size).toBe(3);
  });

  it('is new for a new game and after a reset, so nothing cached for the old save applies', () => {
    // Play again needs a finished game: here, the two-quarter one (the endless game finishes at a removal).
    setPlayableQuarters(2);
    onTestFinished(() => setPlayableQuarters(PLAYABLE_QUARTERS));
    const save = saves.create(); const req = request(save.id);
    submitPlan(req, { levers: [] }); submitQ2Plan(req, { picks: [null, null, null], levers: [] });
    const finished = version(save.id);
    const again = idOf(startNewGame(request(save.id, 'http://localhost/game/new')));
    const reset = idOf(resetGame(request(again, 'http://localhost/settings/reset')));
    const fresh = saves.create();
    expect(new Set([finished, version(again), version(reset), version(fresh.id)]).size).toBe(4);
  });

  it("changes when the open quarter's Alma record lands, so a view shown before it reaches the server again (Audit)", async () => {
    const save = saves.create(); const req = request(save.id);
    submitPlan(req, { levers: [] });
    submitQ2Plan(req, { picks: [null, null, null], levers: [] });
    // Q3 is open, and Alma's record for it is still being written in the background.
    const turn = pendingTurn(save.id, '2194-Q3');
    expect(turn).toBeDefined();
    expect(saves.read(save.id).alma).toBeUndefined();
    const before = version(save.id);
    const handle = createQueryHandler({ track: () => {} });
    const ask = () => handle(new Request('http://localhost:3000/api/query', { method: 'POST',
      headers: { cookie: 'orbital_save=' + save.id, origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: JSON.stringify({ measure: 'revenue', by: ['month'] }) }));
    // The record lands: a new version, so a browser cache keyed on the old one asks the server again.
    expect(await turn).toMatchObject({ quarter: '2194-Q3' });
    const after = version(save.id);
    expect(after).not.toBe(before);
    expect((await ask()).headers.get(DATA_VERSION_HEADER)).toBe(after);
    // Writes that don't change what a view proves still keep it.
    markAlertSeen(req);
    expect(version(save.id)).toBe(after);
  });

  it('comes back with every query result, from the same save as its view', async () => {
    const save = saves.create();
    const handle = createQueryHandler({ track: () => {} });
    const ask = () => handle(new Request('http://localhost:3000/api/query', { method: 'POST',
      headers: { cookie: 'orbital_save=' + save.id, origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: JSON.stringify({ measure: 'revenue', by: ['quarter'] }) }));
    const before = await ask();
    expect(before.status).toBe(200);
    expect(before.headers.get(DATA_VERSION_HEADER)).toBe(version(save.id));
    submitPlan(request(save.id), { levers: [] });
    const after = await ask();
    expect(after.headers.get(DATA_VERSION_HEADER)).toBe(version(save.id));
    expect(after.headers.get(DATA_VERSION_HEADER)).not.toBe(before.headers.get(DATA_VERSION_HEADER));
    // An error carries none: there's nothing to cache.
    const refused = await handle(new Request('http://localhost:3000/api/query', { method: 'POST',
      headers: { cookie: 'orbital_save=' + save.id, origin: 'http://localhost:3000', 'content-type': 'application/json' }, body: '{}' }));
    expect(refused.status).toBe(400);
    expect(refused.headers.get(DATA_VERSION_HEADER)).toBeNull();
  });
});

describe('a view that is context, never evidence (Plot, #266)', () => {
  it("answers without recording discovery evidence when asked, and records as before otherwise", async () => {
    const save = saves.create();
    submitPlan(request(save.id), { levers: [] });
    const handle = createQueryHandler({ track: () => {} });
    const ask = (headers: Record<string, string> = {}) => handle(new Request('http://localhost:3000/api/query', { method: 'POST',
      headers: { cookie: 'orbital_save=' + save.id, origin: 'http://localhost:3000', 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ measure: 'revenue', by: ['quarter'] }) }));
    const evidence = () => { const { discoveries, discoveryEvidence } = saves.read(save.id); return JSON.stringify([discoveries, discoveryEvidence ?? null]); };
    const before = evidence();
    const context = await ask({ [EVIDENCE_HEADER]: 'none' });
    expect(context.status).toBe(200);
    expect(evidence()).toBe(before);
    // The same view as evidence: last year's quarters beside Q1 2194 (discovery F) is recorded.
    expect((await ask()).status).toBe(200);
    expect(evidence()).not.toBe(before);
  });
});

describe("the result cache, keyed by the save's data version (Goldy)", () => {
  const byQuarter = { measure: 'revenue' as const, by: ['quarter' as const] };
  /** A query's rows and whether the cache answered it. */
  function ask(id: string, query: unknown = byQuarter) {
    const track = vi.fn();
    const result = runQuery(query, getGameSession(request(id)).queryView, track);
    const completed = track.mock.calls.find(([name]) => name === 'query_completed')![1] as { cacheHit: boolean };
    return { quarters: result.rows.map(row => row.quarter), cacheHit: completed.cacheHit, result };
  }

  it('answers a repeat from the cache, and never gives a new plan, a reset or a new game an old answer', () => {
    setPlayableQuarters(2);
    onTestFinished(() => setPlayableQuarters(PLAYABLE_QUARTERS));
    forgetResults();
    const save = saves.create(); const req = request(save.id);
    submitPlan(req, { levers: [] });
    const q1 = ask(save.id);
    expect(q1).toMatchObject({ quarters: ['2193-Q1', '2193-Q2', '2193-Q3', '2193-Q4', '2194-Q1'], cacheHit: false });
    // The same view again: the cache, the same answer.
    expect(ask(save.id)).toEqual({ ...q1, cacheHit: true });
    // A new plan: Q2 is in the answer, not Q1's cached one.
    submitQ2Plan(req, { picks: [null, null, null], levers: [] });
    expect(ask(save.id)).toMatchObject({ quarters: ['2193-Q1', '2193-Q2', '2193-Q3', '2193-Q4', '2194-Q1', '2194-Q2'], cacheHit: false });
    // Play again and Reset game: new saves, with none of the old game's quarters.
    const again = idOf(startNewGame(request(save.id, 'http://localhost/game/new')));
    expect(ask(again).quarters).toEqual(['2193-Q1', '2193-Q2', '2193-Q3', '2193-Q4']);
    submitPlan(request(again), { levers: ['events'] });
    const played = ask(again);
    expect(played).toMatchObject({ quarters: ['2193-Q1', '2193-Q2', '2193-Q3', '2193-Q4', '2194-Q1'], cacheHit: false });
    // Not the first game's Q1 either: a different plan, a different seed, a different total.
    expect(played.result.rows.at(-1)!.revenue).not.toBe(q1.result.rows.at(-1)!.revenue);
    const reset = idOf(resetGame(request(again, 'http://localhost/settings/reset')));
    expect(ask(reset).quarters).toEqual(['2193-Q1', '2193-Q2', '2193-Q3', '2193-Q4']);
  });

  it("never caches simulated lines the server didn't name, and refuses a malformed version", () => {
    forgetResults();
    const save = saves.create();
    submitPlan(request(save.id), { levers: [] });
    const { version: _, ...unnamed } = getGameSession(request(save.id)).queryView;
    for (let i = 0; i < 2; i++) {
      const track = vi.fn();
      runQuery(byQuarter, unnamed, track);
      expect(track).toHaveBeenCalledWith('query_completed', expect.objectContaining({ cacheHit: false }));
    }
    expect(() => validateView({ ...unnamed, version: 'not-a-version' })).toThrow(expect.objectContaining({ code: 'INVALID_VIEW' }));
  });

  it('is bounded by entries and by bytes, least recently used out', () => {
    forgetResults();
    onTestFinished(() => { setResultCacheLimits(null); forgetResults(); });
    const save = saves.create();
    submitPlan(request(save.id), { levers: [] });
    const queries = (['revenue', 'units', 'orders', 'avg_discount'] as const).map(measure => ({ measure, by: ['quarter' as const] }));
    setResultCacheLimits({ entries: 3 });
    for (const query of queries) ask(save.id, query);
    expect(resultCacheSize().entries).toBe(3);
    // The first went; the others are still there.
    expect(ask(save.id, queries[0]).cacheHit).toBe(false);
    expect(ask(save.id, queries[3]).cacheHit).toBe(true);
    forgetResults();
    // A byte bound that holds about two of these results.
    const one = JSON.stringify(ask(save.id, queries[0]).result).length;
    forgetResults();
    setResultCacheLimits({ bytes: Math.floor(one * 2.5) });
    for (const query of queries) ask(save.id, query);
    expect(resultCacheSize().entries).toBe(2);
    expect(resultCacheSize().bytes).toBeLessThanOrEqual(Math.floor(one * 2.5));
  });
});
