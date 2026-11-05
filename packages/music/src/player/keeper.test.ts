import { mock, test } from "node:test";
import assert from "node:assert/strict";
const { keepAlive, newAudioSession, REVIVE_MS, WATCH_MS } = await import("./keeper.ts");

// a context whose output may fail to open, as on David's Pixel over Bluetooth
// (5 Nov 2026): running, its time still, then put to sleep by the browser
const setup = (o: { fails?: number } = {}) => {
  let fails = o.fails ?? 0;
  const heard = new Map<string, () => void>();
  const calls: string[] = [];
  let flowing = false;
  const ctx = {
    state: "running" as AudioContextState,
    currentTime: 0,
    outputLatency: 0.18,
    addEventListener: (e: string, f: () => void) => void heard.set(e, f),
    removeEventListener() {},
    suspend() {
      calls.push("suspend");
      ctx.state = "suspended";
      flowing = false;
      heard.get("statechange")?.();
      return Promise.resolve();
    },
    resume() {
      calls.push("resume");
      ctx.state = "running";
      flowing = fails-- <= 0;
      heard.get("statechange")?.();
      return Promise.resolve();
    },
    /** the browser gives up on an output that didn't open */
    dies() {
      ctx.state = "suspended";
      heard.get("statechange")?.();
    },
  };
  const doc = { hidden: false, f: () => {}, addEventListener: (_: string, f: () => void) => void (doc.f = f), removeEventListener() {} };
  const events: [string, object | undefined][] = [];
  const keeper = keepAlive(ctx as never, { context: "music", track: (e, p) => void events.push([e, p]), doc });
  // time passes: the context's time moves only while its output flows
  const pass = (ms: number) => {
    for (let t = 0; t < ms; t += 100) {
      if (flowing && ctx.state === "running") ctx.currentTime += 0.1;
      mock.timers.tick(100);
    }
  };
  return { ctx, doc, keeper, calls, events, pass, away: (hidden: boolean) => ((doc.hidden = hidden), doc.f()) };
};
const run = (f: () => Promise<void> | void) => async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  newAudioSession();
  try {
    await f();
  } finally {
    mock.timers.reset();
  }
};
const settle = () => new Promise((r) => setImmediate(r));

test("an output that fails to open on the app's return is opened again, and that's reported (audio_stalled, audio_revived)", run(async () => {
  const { ctx, calls, events, pass, away } = setup({ fails: 1 });
  away(true);
  assert.equal(ctx.state, "suspended", "asleep while away");
  away(false); // its output doesn't open: its time stays still
  pass(WATCH_MS);
  await settle();
  pass(REVIVE_MS[0]); // opened again: asleep, then awake
  await settle();
  pass(WATCH_MS);
  await settle();
  assert.deepEqual(calls, ["suspend", "resume", "suspend", "resume"]);
  assert.deepEqual(events[0], ["audio_stalled", { context: "music", after: "return", state: "silent", latencyMs: 180 }]);
  assert.equal(events[1][0], "audio_revived");
  assert.equal((events[1][1] as { tries: number }).tries, 1);
}));

test("a context the browser put to sleep unasked is woken, with the waits backing off", run(async () => {
  const { ctx, keeper, events, pass } = setup({ fails: 2 });
  keeper.wake();
  ctx.dies();
  assert.equal((events[0][1] as { state: string }).state, "suspended");
  pass(REVIVE_MS[0] - 100);
  await settle();
  assert.equal(ctx.state, "suspended", "not before its wait");
  for (let i = 0; i < 6 && events.length < 2; i++) {
    pass(10_000);
    await settle();
  }
  assert.equal(events[1][0], "audio_revived");
  assert.equal((events[1][1] as { tries: number }).tries, 3, "two opens failed, the third flowed");
}));

test("after five tries it gives up, and says so (audio_revive_failed)", run(async () => {
  const { keeper, events, pass } = setup({ fails: 99 });
  keeper.wake();
  for (let i = 0; i < 8; i++) {
    pass(10_000);
    await settle();
  }
  assert.equal(events.at(-1)![0], "audio_revive_failed");
  assert.equal((events.at(-1)![1] as { tries: number }).tries, 5);
}));

test("a sleep asked for is never revived, and nothing wakes while the app's away", run(async () => {
  const { ctx, keeper, calls, events, pass, away } = setup();
  keeper.sleep();
  pass(20_000);
  away(true);
  away(false); // back: still asleep, as asked
  pass(20_000);
  away(true);
  keeper.wake(); // the music's play, while away: on return
  pass(5000);
  await settle();
  assert.equal(ctx.state, "suspended");
  assert.deepEqual(events, []);
  away(false);
  assert.equal(ctx.state, "running");
  assert.deepEqual(calls, ["suspend", "resume"]);
}));

test("at most 5 stalls a session are reported", run(async () => {
  const { ctx, keeper, events, pass } = setup();
  for (let i = 0; i < 7; i++) {
    keeper.wake();
    ctx.dies();
    pass(REVIVE_MS[0]);
    await settle();
    pass(WATCH_MS);
    await settle();
  }
  assert.equal(events.filter(([e]) => e === "audio_stalled").length, 5);
}));

test("an output slow to start (1.3 s, as over Bluetooth) isn't taken for a failed one", run(async () => {
  const { ctx, keeper, events, pass } = setup();
  ctx.state = "suspended";
  keeper.wake();
  ctx.currentTime = 0;
  // its time starts 1.3 s late
  mock.timers.tick(1300);
  pass(WATCH_MS - 1300);
  await settle();
  assert.deepEqual(events, []);
}));

test("the game's own sense of away (doc): told again with nothing changed, a revive carries on", run(async () => {
  const { ctx, doc, keeper, events, pass } = setup({ fails: 1 });
  keeper.wake();
  ctx.dies();
  doc.f(); // the game says it's in sight, again
  for (let i = 0; i < 4 && events.length < 2; i++) {
    pass(10_000);
    await settle();
  }
  assert.equal(events[1]?.[0], "audio_revived");
}));
