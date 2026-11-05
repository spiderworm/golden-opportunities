// For tests: one browser's Web Locks and BroadcastChannels, enough for
// createSync (sync.test.ts, and the player's oneTab tests).
import { createSync } from "./sync.ts";

export function fakeBrowser() {
  const held = new Map<string, () => void>(); // name → release
  const queued = new Map<string, (() => void)[]>();
  const locks = {
    async request(name: string, cb: () => Promise<void> | undefined) {
      while (held.has(name)) await new Promise<void>((r) => queued.set(name, [...(queued.get(name) ?? []), r]));
      let release = () => {};
      held.set(name, () => release());
      const done = cb();
      if (done) await Promise.race([done, new Promise<void>((r) => (release = r))]);
      held.delete(name);
      queued.get(name)?.shift()?.();
    },
    async query() {
      return { held: [...held.keys()].map((name) => ({ name })) };
    },
  } as unknown as LockManager;
  const channels = new Map<string, Set<{ onmessage: ((e: MessageEvent) => void) | null }>>();
  const channel = (name: string) => {
    const all = channels.get(name) ?? new Set();
    channels.set(name, all);
    const c = {
      onmessage: null as ((e: MessageEvent) => void) | null,
      postMessage(data: unknown) {
        for (const other of all) if (other !== c) queueMicrotask(() => other.onmessage?.({ data } as MessageEvent));
      },
      close: () => void all.delete(c),
    };
    all.add(c);
    return c;
  };
  let n = 0;
  const options = (o: { deaf?: boolean } = {}) => ({ locks, channel: o.deaf ? () => ({ onmessage: null, postMessage() {}, close() {} }) : channel, timeoutMs: 50, tab: String(++n) });
  return {
    tab: (app = "a", o: { deaf?: boolean } = {}) => createSync(app, options(o)),
    /** a tab's sync options (for createMusic's oneTab) */
    options,
    /** a tab's locks go, and it says nothing */
    crash: (tab: string) => [...held.keys()].filter((k) => k.endsWith(`.tab.${tab}`)).forEach((k) => held.get(k)!()),
  };
}
