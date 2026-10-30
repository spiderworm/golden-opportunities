import { beforeEach, expect, it, vi } from 'vitest';
import type { AssistantProvider } from './server/provider.server';
import type { Route } from './+types/route';
const mocks = vi.hoisted(() => ({ revoke: vi.fn(), token: vi.fn(), real: vi.fn(), ask: vi.fn(), order: [] as string[] }));
vi.mock('./server/queryToken.server.ts', () => ({ queryToken: mocks.token }));
vi.mock('./server/assistant.server.ts', () => ({ getAssistant: (make: () => AssistantProvider) => make() }));
vi.mock('./server/claudeCode.server.ts', () => ({ claudeCodeAssistant: mocks.real }));
vi.mock('./server/ask.server.ts', () => ({ ask: mocks.ask }));
vi.mock('~/platform/analytics/analytics.server', () => ({ trackServer: vi.fn() }));
import { action } from './route';
import { SaveError } from '~/game/store.server';
beforeEach(() => {
  vi.clearAllMocks(); mocks.order.length = 0;
  mocks.revoke.mockImplementation(() => { mocks.order.push('revoked'); });
  mocks.token.mockReturnValue({ token: 'environment-only-token', revoke: mocks.revoke });
  mocks.ask.mockReturnValue(Promise.resolve(new Response('ok')));
});
function providerForRequest(): AssistantProvider {
  const request = new Request('http://localhost/api/assistant', { method: 'POST' });
  void action({ request } as Route.ActionArgs);
  expect(mocks.token).not.toHaveBeenCalled();
  const provider = mocks.ask.mock.calls[0][1]({ pins: true });
  expect(mocks.token).toHaveBeenCalledWith(request);
  return provider;
}
it.each(['done', 'error', 'cancel'])('revokes after provider cleanup on %s', async mode => {
  mocks.real.mockReturnValue({ name: 'test', async *ask() {
    try { yield { type: 'text', text: 'hello' }; if (mode === 'error') throw Error('provider failed'); }
    finally { mocks.order.push('provider closed'); }
  } });
  const provider = providerForRequest();
  const iterator = provider.ask({ system: '', message: '' }, new AbortController().signal)[Symbol.asyncIterator]();
  await iterator.next();
  if (mode === 'cancel') await iterator.return?.();
  else if (mode === 'error') await expect(iterator.next()).rejects.toThrow('provider failed');
  else await iterator.next();
  expect(mocks.order).toEqual(['provider closed', 'revoked']);
  expect(mocks.real.mock.calls[0][0].server.env.ORBITAL_QUERY_TOKEN).toBe('environment-only-token');
});
it('revokes when provider construction fails and exposes only a fixed unavailable message', async () => {
  mocks.real.mockImplementation(() => { throw Error('secret details'); });
  const provider = providerForRequest();
  const events = [];
  for await (const event of provider.ask({ system: '', message: '' }, new AbortController().signal)) events.push(event);
  expect(mocks.revoke).toHaveBeenCalledOnce();
  expect(JSON.stringify(events)).toContain('The assistant is unavailable right now. Try again in a moment.');
  expect(JSON.stringify(events)).not.toContain('secret');
  expect(JSON.stringify(events)).not.toContain('environment-only-token');
});

it.each(['MISSING_SAVE', 'SAVE_BUSY'] as const)('uses the start-game message only for missing saves (%s)', async code => {
  mocks.token.mockImplementation(() => { throw new SaveError(code); });
  const events = [];
  for await (const event of providerForRequest().ask({ system: '', message: '' }, new AbortController().signal)) events.push(event);
  expect(events).toEqual([{ type: 'text', text: code === 'MISSING_SAVE'
    ? 'Start a game, then try your question again.'
    : 'The assistant is unavailable right now. Try again in a moment.' }]);
  expect(mocks.revoke).not.toHaveBeenCalled();
});
