import { test } from "node:test";
import assert from "node:assert/strict";
import { createTabs } from "./tabs.ts";

// One browser's Web Locks and BroadcastChannels, enough for createTabs.
function browser() {
  let holder: object | null = null;
  const waiting: { who: object; grant: () => void }[] = [];
  const channels = new Set<{ onmessage: ((e: MessageEvent) => void) | null }>();
  const locks = (who: object) =>
    ({
      async request(_name: string, options: LockOptions, cb: (lock: Lock | null) => Promise<void>) {
        if (!holder) {
          holder = who;
          await cb({} as Lock);
          holder = null;
          const next = waiting.shift();
          next?.grant();
          return;
        }
        if (options.ifAvailable) return cb(null);
        await new Promise<void>((granted, refused) => {
          const entry = { who, grant: () => granted() };
          waiting.push(entry);
          options.signal?.addEventListener("abort", () => {
            waiting.splice(waiting.indexOf(entry), 1);
            refused(new DOMException("timed out", "AbortError"));
          });
        });
        holder = who;
        await cb({} as Lock);
        holder = null;
        waiting.shift()?.grant();
      },
      async query() {
        return { held: holder ? [{ name: "t.music.playing" }] : [] };
      },
    }) as unknown as LockManager;
  const channel = () => {
    const c = {
      onmessage: null as ((e: MessageEvent) => void) | null,
      postMessage(data: unknown) {
        for (const other of channels) if (other !== c) queueMicrotask(() => other.onmessage?.({ data } as MessageEvent));
      },
      close: () => void channels.delete(c),
    };
    channels.add(c);
    return c;
  };
  return { tab: (o: { deaf?: boolean } = {}) => {
    const who = {};
    return createTabs("t", { locks: locks(who), channel: o.deaf ? () => ({ onmessage: null, postMessage() {}, close() {} }) : channel, timeoutMs: 50 });
  } };
}
const tick = () => new Promise((r) => setTimeout(r, 5));

test("a tab takes the music when it's free, and others know it has it", async () => {
  const b = browser();
  const one = b.tab();
  const two = b.tab();
  assert.equal(await one.claimIfFree(), true);
  assert.equal(one.mine(), true);
  await tick();
  assert.equal(two.elsewhere(), true);
  assert.equal(await two.claimIfFree(), false);
});

test("the player's play takes the music from the tab that has it, which stops", async () => {
  const b = browser();
  const one = b.tab();
  const two = b.tab();
  let stopped = false;
  one.onTaken(() => (stopped = true));
  await one.claimIfFree();
  await tick();
  assert.equal(await two.claim(), true);
  assert.equal(stopped, true);
  assert.equal(one.mine(), false);
  assert.equal(two.mine(), true);
  await tick();
  assert.equal(one.elsewhere(), true);
});

test("a tab that won't let go keeps it, and the asking tab is told", async () => {
  const b = browser();
  const deaf = b.tab({ deaf: true }); // an older build: no channel
  const two = b.tab();
  await deaf.claimIfFree();
  assert.equal(await two.claim(), false);
  assert.equal(two.mine(), false);
});

test("a pause lets go, so a tab opened next finds it free", async () => {
  const b = browser();
  const one = b.tab();
  await one.claimIfFree();
  one.release();
  await tick();
  const two = b.tab();
  await tick();
  assert.equal(two.elsewhere(), false);
  assert.equal(await two.claimIfFree(), true);
});

test("without Web Locks, nothing is known: it just plays", async () => {
  const t = createTabs("t", { locks: null });
  assert.equal(t.elsewhere(), false);
  assert.equal(await t.claim(), true);
});
