import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { rmSync } from 'node:fs';
const directory = await vi.hoisted(async () => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  return mkdtempSync(tmpdir() + '/orbital-q2-discoveries-');
});
vi.mock('../platform/analytics/instance.server', () => ({ DATA_DIR: directory }));
vi.mock('../platform/analytics/analytics.server', () => ({ trackServer: vi.fn() }));
import { getOutcome, submitPlan, submitQ2Plan } from './game.server';
import { recordDiscoveries } from './discoveries.server';
import { D_PICKS, MAX_EVIDENCE_SCOPES, witnessScopes } from './discovery-evidence';
import { getGameSession, saves } from './session.server';
import { loadBookshop } from '../bookshop/loader.server';
import { historyOf } from '../simulation/model';
import { runQuery } from '../query/run-query.server';
import { BASELINE_VIEW } from '../query/view.server';
import { trackServer } from '../platform/analytics/analytics.server';
import type { Query } from '../query/types';

const request = (id: string) => new Request('http://localhost/decide', { method: 'POST', headers: { origin: 'http://localhost', cookie: 'orbital_save=' + id } });
/** A save in Q2: Q1 played, Q2 not yet. */
function inQ2() { const save = saves.create(); submitPlan(request(save.id), { levers: [] }); return save.id; }
function see(id: string, ...queries: Query[]) {
  const { save, queryView } = getGameSession(request(id));
  recordDiscoveries(save, queryView, queries.map(query => ({ query, result: runQuery(query, queryView) })));
  return saves.read(id).discoveries;
}
const pick = (title: string) => D_PICKS.find(p => p.title === title)!;
const pickMonths = (title: string, by: Query['by'] = ['month'], quarter?: string[]): Query =>
  ({ measure: 'units', by, filter: { title: [title], ...(by.includes('format') ? {} : { format: [pick(title).format] }), ...(quarter ? { quarter } : {}) } });
const parts = () => vi.mocked(trackServer).mock.calls.filter(c => c[0] === 'discovery_part_found').map(c => (c[1] as { part: string }).part);
const found = () => vi.mocked(trackServer).mock.calls.filter(c => c[0] === 'discovery_found').map(c => (c[1] as { id: string }).id);
afterEach(() => vi.clearAllMocks());
afterAll(() => rmSync(directory, { recursive: true, force: true }));

describe("D's picks", () => {
  it("are 2193's Books of the Month, busy at 100 or more copies an average other month and quiet under 25", () => {
    const data = loadBookshop();
    // One history per quarter, not per month: each is slow to build, and 12 took over 5 s on one worker (Sim).
    const histories = ([1, 2, 3, 4] as const).map(q => historyOf(data, q));
    // Every month's pick: those in D_PICKS are busy or quiet as listed, and the rest (January's) neither, so the list is complete.
    for (let m = 1; m <= 12; m++) {
      const month = String(m).padStart(2, '0'); const key = `2193-${month}`;
      const line = data.saleLines.find(l => l.isbn === histories[Math.ceil(m / 3) - 1].observedPick(month))!;
      const rows = runQuery({ measure: 'units', by: ['month'], filter: { title: [line.title], format: [line.format] } }, BASELINE_VIEW).rows;
      const average = rows.filter(r => r.month !== key).reduce((sum, r) => sum + Number(r.units), 0) / 11;
      const p = D_PICKS.find(d => d.month === m);
      if (p) expect(line).toMatchObject({ title: p.title, format: p.format });
      expect(p ? (p.busy ? average >= 100 : average < 25) : average >= 25 && average < 100).toBe(true);
    }
  });
});

describe('Q2 discoveries', () => {
  it('finds D from one busy and one quiet pick, by month, each in its month and three others', () => {
    const id = inQ2();
    // July's Ballinby Boys: months 4 to 12 are 2193's alone in Q2, so no quarter filter is needed.
    expect(see(id, pickMonths('Ballinby Boys'))).toEqual([]);
    expect(parts()).toEqual(['D_partial']);
    expect(see(id, pickMonths('Nothing But Capers', ['month', 'format']))).toContain('D');
    expect(found()).toEqual(['D']);
    expect(getGameSession(request(id)).save.discoveries).toEqual(['D']);
  });

  it("counts 2193's months, never the player's 2194, and not too few months or a subset of the sales", () => {
    const id = inQ2();
    // February's Seawitch: month keys name their year, so 2193's February is its own row beside 2194's.
    const rows = runQuery(pickMonths('The Seawitch Sings'), getGameSession(request(id)).queryView).rows.map(r => r.month);
    expect(rows).toEqual(expect.arrayContaining(['2193-02', '2194-02']));
    const only2194 = saves.create(); submitPlan(request(only2194.id), { levers: [] });
    see(only2194.id, { ...pickMonths('The Seawitch Sings'), filter: { ...pickMonths('The Seawitch Sings').filter, quarter: ['2194-Q1'] } }, pickMonths('Nothing But Capers'));
    expect(saves.read(only2194.id).discoveries).toEqual([]);
    see(id, { ...pickMonths('Ballinby Boys'), filter: { ...pickMonths('Ballinby Boys').filter, month: ['2193-06', '2193-07', '2193-08'] } });
    see(id, { ...pickMonths('Ballinby Boys'), filter: { ...pickMonths('Ballinby Boys').filter, weekday: ['Monday'] } });
    see(id, { measure: 'revenue', by: ['month'], filter: pickMonths('Ballinby Boys').filter });
    expect(saves.read(id).discoveries).toEqual([]);
    expect(see(id, pickMonths('The Seawitch Sings'))).toEqual([]);
    expect(see(id, pickMonths('Nothing But Capers'))).toEqual(['D']);
  });

  it('finds E from average rating for 20 titles in one view; fewer is only a part', () => {
    const id = inQ2();
    expect(see(id, { measure: 'avg_rating', by: ['title'], filter: { genre: ['Memoir'] } })).toEqual([]);
    expect(parts()).toEqual(['E_partial']);
    expect(see(id, { measure: 'avg_rating', by: ['title'] })).toEqual(['E']);
    expect(found()).toEqual(['E']);
  });

  it('finds F from Q1 2193 beside Q1 2194, in one view or two matching ones', () => {
    const a = inQ2();
    expect(see(a, { measure: 'revenue', by: ['quarter'] })).toEqual(['F']);
    const b = inQ2();
    expect(see(b, { measure: 'units', by: ['genre'], filter: { quarter: ['2193-Q1'] } })).toEqual([]);
    expect(see(b, { measure: 'revenue', by: ['genre'], filter: { quarter: ['2194-Q1'] } })).toEqual([]);
    expect(see(b, { measure: 'units', by: ['genre'], filter: { quarter: ['2194-Q1'] } })).toEqual(['F']);
  });

  it("records D, E and F only while Q2 is being planned, and keeps each quarter's on its own result", () => {
    const save = saves.create(); const id = save.id;
    const q2Views: Query[] = [pickMonths('Ballinby Boys'), pickMonths('Nothing But Capers'), { measure: 'avg_rating', by: ['title'] }];
    see(id, ...q2Views);
    expect(saves.read(id).discoveries).toEqual([]);
    see(id, { measure: 'units', by: ['month'], filter: { discount_rate: ['15%'], title: ['Hashtag QuokkaSelfie'] } },
      { measure: 'units', by: ['month', 'title'], filter: { discount_rate: ['15%'], month: ['2193-01', '2193-02', '2193-03'] } });
    expect(saves.read(id).discoveries).toEqual(['C']);
    submitPlan(request(id), { levers: [] });
    expect(see(id, ...q2Views, { measure: 'revenue', by: ['quarter'] })).toEqual(['C', 'D', 'E', 'F']);
    submitQ2Plan(request(id), { picks: [null, null, null], levers: [] });
    expect(getOutcome(request(id))!.discoveries).toEqual(['C']);
    expect(getOutcome(request(id), '2194-Q2')!.discoveries).toEqual(['D', 'E', 'F']);
    const after = saves.read(id);
    see(id, { measure: 'units', by: ['quarter'] });
    expect(saves.read(id)).toEqual(after);
  });

  it("keeps D's two witnesses when the oldest scopes are discarded", { timeout: 30_000 }, () => {
    const id = inQ2();
    see(id, pickMonths('Ballinby Boys'));
    // A full store of other scopes, each one title's Q1 2193 (half of F, in its own scope).
    const titles = runQuery({ measure: 'units', by: ['title'] }, BASELINE_VIEW).rows.map(r => String(r.title));
    const filler: Query[] = (['units', 'revenue'] as const).flatMap(measure => titles.map(title => ({ measure, by: [], filter: { quarter: ['2193-Q1'], title: [title] } }))).slice(0, 70);
    expect(filler.length).toBeGreaterThan(MAX_EVIDENCE_SCOPES);
    // One write carries at most 64 scopes, as page loads do.
    see(id, ...filler.slice(0, 60)); see(id, ...filler.slice(60));
    expect(Object.keys(saves.read(id).discoveryEvidence!).length).toBe(MAX_EVIDENCE_SCOPES);
    expect(see(id, pickMonths('Nothing But Capers'))).toEqual(['D']);
    expect(witnessScopes(saves.read(id).discoveryEvidence!).size).toBeGreaterThanOrEqual(2);
  });
});
