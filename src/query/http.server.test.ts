import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { issueGameQueryToken } from '../game/query-token.server';
import { saves } from '../game/session.server';
import { rmSync } from 'node:fs';
import { createQueryHandler } from './http.server';
import { QueryError } from './errors';
import type { QueryResult } from './types';

const { directory } = await vi.hoisted(async () => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  return { directory: mkdtempSync(tmpdir() + '/query-http-') };
});
vi.mock('../platform/analytics/instance.server', () => ({ DATA_DIR: directory }));
vi.mock('../platform/analytics/analytics.server', () => ({ trackServer: vi.fn() }));
const save = saves.create();
const capability = issueGameQueryToken(save.id);
const getQueryToken = () => capability.token;
afterAll(() => { capability.revoke(); rmSync(directory, { recursive: true, force: true }); });

const url = 'http://localhost:3000/api/query';
const result: QueryResult = { columns: [], rows: [], total: 0, source: 'Test source' };
const payload = JSON.stringify({ measure: 'revenue', by: ['quarter'] });
function request(body: BodyInit = payload, headers: Record<string, string> = {}, target = url): Request {
  return new Request(target, { method: 'POST', headers: { cookie: 'orbital_save=' + save.id, origin: 'http://localhost:3000', 'content-type': 'application/json', ...headers }, body, duplex: 'half' } as RequestInit);
}
function handler() {
  const run = vi.fn(() => result); const track = vi.fn();
  return { run, track, handle: createQueryHandler({ run, track }) };
}
afterEach(() => vi.useRealTimers());

describe('bounded query resource endpoint', () => {
  it('serves source-verified revenue and keeps HTTP responses private', async () => {
    const response = await createQueryHandler({ track: () => {} })(request());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.total).toBeCloseTo(695243.6112, 4);
    expect(body.rows).toHaveLength(4);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });
  it('accepts the save-bound bearer capability for non-browser clients', async () => {
    const { handle, run, track } = handler();
    const response = await handle(new Request(url, { method: 'POST', headers: { authorization: `Bearer ${getQueryToken()}`, 'content-type': 'application/json' }, body: payload }));
    expect(response.status).toBe(200);
    expect(run.mock.calls[0]).toEqual([JSON.parse(payload), expect.objectContaining({ periods: ['2193-Q1', '2193-Q2', '2193-Q3', '2193-Q4'], includeUndated: true }), track]);
    expect(JSON.stringify(track.mock.calls)).not.toContain(getQueryToken());
    expect(getQueryToken()).toBe(getQueryToken());
    expect(getQueryToken().length).toBeGreaterThanOrEqual(40);
  });
  it.each([
    { origin: 'https://attacker.invalid' }, { origin: 'null' }, { origin: '' },
    { origin: 'http://localhost:3001' }, { 'sec-fetch-site': 'cross-site' },
    { authorization: 'Bearer wrong' }, { authorization: 'Basic wrong' },
    { authorization: `Bearer ${'é'.repeat(43)}` },
  ] as Record<string, string>[])('rejects unauthorized access before parsing or execution %#', async headers => {
    const { handle, run } = handler();
    const response = await handle(request('not JSON', headers));
    expect(response.status).toBe(401); expect(run).not.toHaveBeenCalled();
    expect((await response.json()).error.code).toBe('UNAUTHORIZED');
  });
  it('rejects arbitrary same-origin Host/Origin pairs (local DNS rebinding)', async () => {
    const { handle, run } = handler();
    expect((await handle(request(payload, { origin: 'http://attacker.invalid' }, 'http://attacker.invalid/api/query'))).status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });
  it.each(['GET', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'])('rejects %s with Allow: POST', async method => {
    const { handle, run } = handler();
    const response = await handle(new Request(url, { method }));
    expect(response.status).toBe(405); expect(response.headers.get('allow')).toBe('POST'); expect(run).not.toHaveBeenCalled();
  });
  it.each([
    ['not JSON', {}, 400],
    [payload, { 'content-type': 'text/plain' }, 415],
    [payload, { 'content-encoding': 'gzip' }, 415],
    [payload, { 'content-length': '20000' }, 413],
    [payload, { 'content-length': 'invalid' }, 413],
    [' '.repeat(16385), {}, 413],
    [' '.repeat(16385), { 'content-length': '1' }, 413],
    ['界'.repeat(6000), {}, 413],
  ] as const)('rejects malformed/oversized requests %#', async (body, headers, expected) => {
    const { handle, run } = handler();
    expect((await handle(request(body, headers))).status).toBe(expected);
    expect(run).not.toHaveBeenCalled();
  });
  it('bounds streamed bodies without trusting Content-Length', async () => {
    const stream = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new Uint8Array(8192)); controller.enqueue(new Uint8Array(8193)); controller.close();
    } });
    const { handle, run } = handler();
    expect((await handle(request(stream))).status).toBe(413); expect(run).not.toHaveBeenCalled();
  });
  it('rejects view and free-form properties even with the agent token', async () => {
    const handle = createQueryHandler({ track: () => {} });
    const response = await handle(request(JSON.stringify({ measure: 'revenue', by: [], view: { periods: ['9999-Q1'] } }), { authorization: `Bearer ${getQueryToken()}` }));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('INVALID_QUERY');
  });
  it("refuses Investigate-only measures and dimensions from Dewey's token, until Probe has reviewed them", async () => {
    const handle = createQueryHandler({ track: () => {} });
    const agent = { authorization: `Bearer ${getQueryToken()}` };
    for (const query of [{ measure: 'ratings', by: [] }, { measure: 'avg_rating', by: ['title'], sort: { column: 'title', direction: 'asc' }, filter: { title: ['Rystwyth'] } }]) {
      const ok = (await handle(request(JSON.stringify(query)))).status;
      expect(ok).toBe(200);
    }
    for (const [query, name] of [[{ measure: 'ratings', by: ['title'] }, 'ratings'], [{ measure: 'ratings', by: [], filter: { title: ['Rystwyth'] } }, 'ratings'],
      [{ measure: 'units', by: ['awarded'] }, 'awarded'], [{ measure: 'units', by: [], filter: { award: ['Pulitzer'] } }, 'award'],
      [{ measure: 'units', by: ['volume'] }, 'volume'], [{ measure: 'units', by: [], filter: { in_series: ['yes'] } }, 'in_series']] as const) {
      const response = await handle(request(JSON.stringify(query), agent));
      expect(response.status).toBe(400);
      expect((await response.json()).error).toEqual({ code: 'INVALID_QUERY', message: `${name} isn't available to the assistant yet.` });
    }
    expect((await handle(request(JSON.stringify({ measure: 'avg_rating', by: ['title'] }), agent))).status).toBe(200);
  });
  it('rejects URL query input and incompatible fact dimensions clearly', async () => {
    const handle = createQueryHandler({ track: () => {} });
    expect((await handle(request(payload, {}, url + '?view=future'))).status).toBe(400);
    const response = await handle(request(JSON.stringify({ measure: 'avg_rating', by: ['quarter'] })));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatchObject({ code: 'INCOMPATIBLE_DIMENSION' });
  });
  it('bounds per-principal rates and resets the window without storing identity data', async () => {
    let now = 0; const run = vi.fn(() => result);
    const handle = createQueryHandler({ run, track: () => {}, now: () => now });
    for (let i = 0; i < 60; i++) expect((await handle(request())).status).toBe(200);
    const response = await handle(request());
    expect(response.status).toBe(429); expect(response.headers.get('retry-after')).toBe('60');
    expect(run).toHaveBeenCalledTimes(60);
    now = 60000;
    expect((await handle(request())).status).toBe(200);
  });
  it('caps global requests across browser and MCP principals', async () => {
    const { handle } = handler();
    for (let i = 0; i < 50; i++) {
      expect((await handle(request())).status).toBe(200);
      expect((await handle(request(payload, { authorization: `Bearer ${getQueryToken()}` }))).status).toBe(200);
    }
    expect((await handle(request())).status).toBe(429);
  });
  it('caps concurrent bodies and releases admission after the five-second deadline', async () => {
    vi.useFakeTimers();
    const { handle, run } = handler();
    const pending = Array.from({ length: 8 }, () => handle(request(new ReadableStream())));
    expect((await handle(request())).status).toBe(429);
    await vi.advanceTimersByTimeAsync(5001);
    expect((await Promise.all(pending)).every(response => response.status === 400)).toBe(true);
    expect(run).not.toHaveBeenCalled();
    expect((await handle(request())).status).toBe(200);
  });
  it('returns bounded errors and provenance without revealing internal exception content', async () => {
    for (const bad of [
      { ...result, source: 'x'.repeat(4097) },
      { ...result, rows: [{ title: 'x'.repeat(201) }] },
      { ...result, rows: Array.from({ length: 200 }, () => ({ title: '界'.repeat(200), author: '界'.repeat(200) })) },
    ]) {
      const response = await createQueryHandler({ run: () => bad, track: () => {} })(request());
      expect(response.status).toBe(422); expect((await response.json()).error.code).toBe('RESULT_TOO_LARGE');
    }
    const huge = await createQueryHandler({ run: () => { throw new QueryError('INVALID_QUERY', 'x'.repeat(500)); }, track: () => {} })(request());
    expect(huge.status).toBe(422); expect((await huge.text()).length).toBeLessThan(300);
    const secret = await createQueryHandler({ run: () => { throw new Error('SECRET_EXCEPTION'); }, track: () => {} })(request());
    expect(secret.status).toBe(500); expect(await secret.text()).not.toContain('SECRET_EXCEPTION');
  });
});
