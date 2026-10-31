import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const directory = await vi.hoisted(async () => {
  const { mkdtempSync } = await import('node:fs'); const { tmpdir } = await import('node:os');
  return mkdtempSync(tmpdir() + '/orbital-discoveries-');
});
vi.mock('../platform/analytics/instance.server', () => ({ DATA_DIR: directory }));
vi.mock('../platform/analytics/analytics.server', () => ({ trackServer: vi.fn() }));
import { saves, getGameSession } from './session.server';
import { createSaveStore, SaveError } from './store.server';
import { issueGameQueryToken, saveForQueryToken } from './query-token.server';
import { createQueryHandler } from '../query/http.server';
import { runQuery } from '../query/run-query.server';
import { submitPlan, getOutcome } from './game.server';
import { recordDiscoveries } from './discoveries.server';
import { evidenceFromQuery } from './discovery-rules';
import { trackServer } from '../platform/analytics/analytics.server';
import { loader as investigateLoader } from '../investigate/route';
import type { Route } from '../investigate/+types/route';
import type { Query } from '../query/types';

const q: Query = { measure: 'units', by: ['title', 'month'], filter: { discount_rate: ['15%'] } };
const request = (id: string, search = '') => new Request('http://localhost/investigate' + search, { headers: { cookie: 'orbital_save=' + id } });
const load = (id: string, search = '') => investigateLoader({ request: request(id, search) } as Route.LoaderArgs);
function api(id: string, query: unknown, token?: string, handler = createQueryHandler({ track: () => {} })) {
  return handler(new Request('http://localhost/api/query', { method: 'POST', headers: {
    origin: 'http://localhost', cookie: 'orbital_save=' + id, 'content-type': 'application/json',
    ...(token ? { authorization: 'Bearer ' + token } : {}),
  }, body: JSON.stringify(query) }));
}
afterAll(() => rmSync(directory, { recursive: true, force: true }));
beforeEach(() => vi.mocked(trackServer).mockClear());
afterEach(() => vi.restoreAllMocks());

it('records Dewey evidence without ending its capability; play ends it and freezes the outcome', async () => {
  const save = saves.create(); const other = saves.create(); const cap = issueGameQueryToken(save.id);
  try {
    expect((await api(other.id, q, cap.token)).status).toBe(200);
    const discovered = saves.read(save.id);
    expect(discovered.discoveries).toEqual(['C']);
    expect(discovered.revision).toBe(1); expect(discovered.queryRevision).toBe(0);
    expect(saveForQueryToken(cap.token).discoveries).toEqual(['C']);
    expect(saves.read(other.id).discoveries).toEqual([]);
    expect((await api(save.id, q, cap.token)).status).toBe(200);
    expect(saves.read(save.id).revision).toBe(1);
    expect(vi.mocked(trackServer).mock.calls.filter(c => c[0] === 'discovery_found')).toEqual([['discovery_found', { id: 'C' }]]);
    submitPlan(new Request('http://localhost/decide', { method: 'POST', headers: { origin: 'http://localhost', cookie: 'orbital_save=' + save.id } }), { levers: [] });
    expect(() => saveForQueryToken(cap.token)).toThrow('That session ended');
    const before = saves.read(save.id);
    await api(save.id, { measure: 'orders', by: ['weekday', 'quarter'] });
    expect(saves.read(save.id)).toEqual(before);
    expect(getOutcome(request(save.id))!.discoveries).toEqual(['C']);
  } finally { cap.revoke(); }
});

it('skips default visits and option queries, but intentional chart/heatmap views count', () => {
  const save = saves.create();
  load(save.id); load(save.id, '?unknown=claim&by=invalid');
  expect(saves.read(save.id)).toEqual(save);
  load(save.id, '?by=format');
  expect(saves.read(save.id)).toEqual(save); // unchanged default heatmap must not award B
  load(save.id, '?by=genre&compare=quarter');
  expect(saves.read(save.id).discoveries).toEqual([]); // A1 only, not the default heatmap's B
  load(save.id, '?measure=avg_order_value&by=quarter');
  expect(saves.read(save.id).discoveries).toEqual(['A']);
  load(save.id, '?measure=orders_per_day'); // this really changes the heatmap
  expect(saves.read(save.id).discoveries).toEqual(['A', 'B']);
  const persisted = createSaveStore(path.join(directory, 'saves')).read(save.id);
  expect(persisted.discoveries).toEqual(['A', 'B']);
  expect(vi.mocked(trackServer).mock.calls.filter(c => c[0] === 'discovery_part_found')).toEqual([
    ['discovery_part_found', { part: 'A1' }], ['discovery_part_found', { part: 'A2' }],
  ]);
});

it('merges evidence from simultaneous snapshots without a lost update and defaults legacy queryRevision', () => {
  const save = saves.create(); const file = path.join(directory, 'saves', save.id + '.json');
  const legacy = JSON.parse(readFileSync(file, 'utf8')); delete legacy.queryRevision; legacy.revision = 3;
  writeFileSync(file, JSON.stringify(legacy));
  const cap = issueGameQueryToken(save.id);
  try {
    const a = getGameSession(request(save.id)); const b = getGameSession(request(save.id));
    for (const [session, month] of [[a, '01'], [b, '02'], [a, '03']] as const) {
      const query: Query = { measure: 'units', by: ['title'], filter: { month: [month], discount_rate: ['15%'] } };
      recordDiscoveries(session.save, session.queryView, [{ query, result: runQuery(query, session.queryView, () => {}) }]);
    }
    const after = saveForQueryToken(cap.token);
    expect(after.queryRevision).toBe(3); expect(after.revision).toBe(6); expect(after.discoveries).toEqual(['C']);
    saves.update(save.id, after.revision, s => { s.seed++; });
    expect(() => saveForQueryToken(cap.token)).toThrow('That session ended');
  } finally { cap.revoke(); }
});

it('rejects claims and never credits unsuccessful or truncated responses', async () => {
  const save = saves.create();
  expect((await api(save.id, { ...q, discoveries: ['C'] })).status).toBe(400);
  expect((await api(save.id, { ...q, limit: 2 })).status).toBe(200);
  const session = getGameSession(request(save.id)); const real = runQuery(q, session.queryView, () => {});
  const handler = createQueryHandler({ track: () => {}, run: () => ({ ...real, source: 'x'.repeat(5000) }) });
  expect((await api(save.id, q, undefined, handler)).status).toBe(422);
  expect(saves.read(save.id)).toEqual(save);
  expect(() => saves.recordEvidence(save.id, 0, { ['a'.repeat(64)]: ['arbitrary claim'] })).toThrow('INVALID_SAVE');
  const evidence = evidenceFromQuery(q, session.queryView, real);
  saves.update(save.id, 0, s => { s.seed++; });
  saves.recordEvidence(save.id, 0, { ['a'.repeat(64)]: evidence });
  expect(saves.read(save.id).discoveries).toEqual([]);
});

it('does not combine Q3 and Q4 under different non-time filters', async () => {
  const save = saves.create();
  for (const [quarter, genre] of [['2193-Q3', 'Fiction'], ['2193-Q4', 'Nonfiction']]) {
    expect((await api(save.id, { measure: 'orders', by: ['weekday'], filter: { quarter: [quarter], genre: [genre] } })).status).toBe(200);
  }
  expect(saves.read(save.id).discoveries).toEqual([]);
  await api(save.id, { measure: 'orders', by: ['weekday'], filter: { quarter: ['2193-Q4'], genre: ['Fiction'] } });
  expect(saves.read(save.id).discoveries).toEqual(['B']);
});
it('combines C pairs across measures and title drilldowns and records partial evidence once', async () => {
  const save = saves.create();
  for (const [measure, month, title] of [['units', '01', 'Thatchwork Cottage'], ['revenue', '02', 'The Seawitch Sings'], ['units', '03', 'Some Eggs or Something?']]) {
    expect((await api(save.id, { measure, by: ['month'], filter: { month: [month], title: [title], discount_rate: ['15%'] } })).status).toBe(200);
  }
  expect(saves.read(save.id).discoveries).toEqual(['C']);
  expect(vi.mocked(trackServer).mock.calls.filter(c => c[0] === 'discovery_part_found')).toEqual([['discovery_part_found', { part: 'C_partial' }]]);
});
it('bounds evidence scopes and keeps awarded discoveries after partial scope eviction', () => {
  const save = saves.create();
  const first = '0'.repeat(64);
  saves.recordEvidence(save.id, 0, { [first]: ['c:1', 'c:2', 'c:3'] });
  for (let i = 1; i <= 70; i++) saves.recordEvidence(save.id, 0, { [i.toString(16).padStart(64, '0')]: ['a2:7'] });
  const after = saves.read(save.id);
  expect(Object.keys(after.discoveryEvidence!)).toHaveLength(64);
  expect(after.discoveries).toEqual(['C']);
  expect(after.queryRevision).toBe(0);
  expect(after.discoveryEvidence).not.toHaveProperty(first);
});

it('retains completed A parts when old partial comparison scopes are evicted', () => {
  const save = saves.create();
  const shape = [3, 4].flatMap(q => Array.from({ length: 8 }, (_, i) => `a1:revenue:genre:${q}:${i}`));
  saves.recordEvidence(save.id, 0, { ['0'.repeat(64)]: shape });
  for (let i = 1; i <= 70; i++) saves.recordEvidence(save.id, 0, { [i.toString(16).padStart(64, '0')]: ['a2:7'] });
  saves.recordEvidence(save.id, 0, { ['f'.repeat(64)]: [7, 8, 9, 10, 11, 12].map(m => `a2:${m}`) });
  expect(saves.read(save.id).discoveries).toEqual(['A']);
});

it('renders already-loaded ledgers when discovery persistence is busy, and can credit a later retry', () => {
  const save = saves.create();
  const write = vi.spyOn(saves, 'recordEvidence').mockImplementationOnce(() => {
    // The competing owner may still hold its lock after the failed evidence write.
    vi.spyOn(saves, 'read').mockImplementation(() => { throw new SaveError('SAVE_BUSY'); });
    throw new SaveError('SAVE_BUSY');
  });
  const data = load(save.id, '?measure=orders_per_day');
  expect(data.chart.rows.length).toBeGreaterThan(0);
  expect(data.heatmap.rows).toHaveLength(84);
  expect(data.planned).toBe(false);
  expect(write).toHaveBeenCalledOnce();
  expect(saves.read).not.toHaveBeenCalled();
  vi.mocked(saves.read).mockRestore();
  expect(saves.read(save.id)).toEqual(save);
  expect(trackServer).toHaveBeenCalledWith('discovery_record_deferred', { code: 'SAVE_BUSY' });
  load(save.id, '?measure=orders_per_day');
  expect(saves.read(save.id).discoveries).toEqual(['B']);
});
