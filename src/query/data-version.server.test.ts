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
import { runQuery } from './run-query.server';

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
