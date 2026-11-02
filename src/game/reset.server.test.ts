import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { rmSync } from 'node:fs';
const directory = await vi.hoisted(async () => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  return mkdtempSync(tmpdir() + '/orbital-reset-');
});
vi.mock('../platform/analytics/instance.server', () => ({ DATA_DIR: directory }));
vi.mock('../platform/analytics/analytics.server', () => ({ trackServer: vi.fn() }));
import { PLAYABLE_QUARTERS, setPlayableQuarters } from './quarters';
import { currentQuarter, resetGame, submitPlan, submitQ2Plan } from './game.server';
import { saves } from './session.server';
import { trackServer } from '../platform/analytics/analytics.server';
import { action } from '../shell/new-game';

// Reset game, from Settings (David, 2 Nov 2026): a new save from 1 January at any point, where Play again waits
// for the half year to be played.

function request(id?: string, method = 'POST', origin = 'http://localhost', url = 'http://localhost/game/new') {
  return new Request(url, { method, headers: { origin, ...(id ? { cookie: 'orbital_save=' + id } : {}) } });
}
async function refusal(action: () => unknown, code: number) {
  try { await action(); } catch (e) { expect(e).toBeInstanceOf(Response); expect((e as Response).status).toBe(code); return; }
  throw new Error('Expected refusal');
}
const newId = (cookie: string) => /^orbital_save=([A-Za-z0-9_-]{43});/.exec(cookie)![1]!;
afterEach(() => vi.clearAllMocks());
afterAll(() => rmSync(directory, { recursive: true, force: true }));
// The game as Q1 and Q2 built it, ending after Q2: the endless loop's own tests are endless.server.test.ts.
beforeAll(() => setPlayableQuarters(2));
afterAll(() => setPlayableQuarters(PLAYABLE_QUARTERS));

describe('resetting the game', () => {
  it.each([
    ['in Q1', 0, 'Q1'],
    ['in Q2', 1, 'Q2'],
    ['once the half year is played', 2, 'finished'],
  ])('starts a new save from 1 January %s, and records how far the old one got', (_, quarters, reached) => {
    const save = saves.create();
    const req = request(save.id);
    if (quarters > 0) submitPlan(req, { levers: [] });
    if (quarters > 1) submitQ2Plan(req, { picks: [null, null, null], levers: [] });
    const id = newId(resetGame(req));
    expect(id).not.toBe(save.id);
    expect(saves.read(id)).toMatchObject({ played: [], discoveries: [], revision: 0 });
    expect(saves.read(id).seed).not.toBe(save.seed);
    expect(currentQuarter(request(id))).toBe('2194-Q1');
    // The old save is left as it was, to expire unused.
    expect(saves.read(save.id).played).toHaveLength(quarters);
    expect(trackServer).toHaveBeenCalledWith('game_reset', { quarter: reached });
  });

  it('starts over from a save that is missing or unreadable, recording the quarter as unknown', () => {
    for (const cookie of [undefined, 'A'.repeat(43)]) {
      const id = newId(resetGame(request(cookie)));
      expect(saves.read(id)).toMatchObject({ played: [], revision: 0 });
      expect(trackServer).toHaveBeenLastCalledWith('game_reset', { quarter: 'unknown' });
    }
  });

  it('refuses anything but a same-origin local POST, and records nothing then', async () => {
    const save = saves.create();
    await refusal(() => resetGame(request(save.id, 'GET')), 405);
    await refusal(() => resetGame(request(save.id, 'POST', 'http://evil.example')), 403);
    expect(trackServer).not.toHaveBeenCalledWith('game_reset', expect.anything());
  });

  it('is what POST /game/new?reset=1 does; without it, Play again still waits for the half year', async () => {
    const save = saves.create();
    const response = await action({ request: request(save.id, 'POST', 'http://localhost', 'http://localhost/game/new?reset=1') } as never);
    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/');
    expect(newId(response.headers.get('Set-Cookie')!)).not.toBe(save.id);
    await refusal(() => action({ request: request(save.id) } as never), 409);
  });
});
