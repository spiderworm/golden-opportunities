import { mock, test } from "node:test";
import assert from "node:assert/strict";
const { stillWhenStopped } = await import("./context.ts");

type S = { song: object | null; playing: boolean; paused: boolean };
const setup = (o: { busy?: () => boolean } = {}) => {
  let state: S = { song: {}, playing: true, paused: false };
  const heard: ((s: S) => void)[] = [];
  const music = { state: () => state, subscribe: (f: (s: S) => void) => (heard.push(f), () => {}) };
  const calls: string[] = [];
  let asleep = false;
  // the keeper (./keeper): only its sleeps and wakes, as they change
  const keeper = {
    sleep: () => void (!asleep && calls.push("suspend"), (asleep = true)),
    wake: () => void (asleep && calls.push("resume"), (asleep = false)),
  };
  stillWhenStopped(music, () => keeper, { ms: 1500, ...o });
  return { calls, now: (s: S) => ((state = s), heard.forEach((f) => f(s))) };
};

test("the context sleeps when the music's paused, or a moment after it's stopped by itself (Bluetooth counts its silence as playing), and wakes for its play", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const { calls, now } = setup();
    // the quiet between two songs: still awake
    now({ song: {}, playing: false, paused: false });
    mock.timers.tick(500);
    now({ song: {}, playing: true, paused: false });
    mock.timers.tick(2000);
    assert.deepEqual(calls, []);
    // paused (the earbuds): asleep at once, so a press just after is a play
    now({ song: {}, playing: false, paused: true });
    assert.deepEqual(calls, ["suspend"]);
    // the player's play: awake at once, before the song sounds
    now({ song: {}, playing: false, paused: false });
    assert.deepEqual(calls, ["suspend", "resume"]);
    // stopped by itself (the app away, say): asleep a moment later
    now({ song: {}, playing: true, paused: false });
    now({ song: {}, playing: false, paused: false });
    mock.timers.tick(1499);
    assert.deepEqual(calls, ["suspend", "resume"]);
    mock.timers.tick(1);
    assert.deepEqual(calls, ["suspend", "resume", "suspend"]);
  } finally {
    mock.timers.reset();
  }
});

test("a context the game's sound effects share never sleeps under them", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    let sounding = true;
    const { calls, now } = setup({ busy: () => sounding });
    now({ song: {}, playing: false, paused: true });
    mock.timers.tick(3000);
    assert.deepEqual(calls, []);
    sounding = false;
    mock.timers.tick(1500);
    assert.deepEqual(calls, ["suspend"]);
  } finally {
    mock.timers.reset();
  }
});

test('the player with context: "own" makes it on the first play, ducks through it, and it sleeps when the player pauses', async () => {
  class FakeAudio {
    volume = 1; preload = ""; paused = true; currentTime = 0; duration = 0; src = "";
    heard = new Map<string, (() => void)[]>();
    addEventListener(e: string, f: () => void) { this.heard.set(e, [...(this.heard.get(e) ?? []), f]); }
    removeAttribute() {}
    pause() { if (!this.paused) (this.paused = true), this.heard.get("pause")?.forEach((f) => f()); }
    play() { if (this.paused) (this.paused = false), this.heard.get("playing")?.forEach((f) => f()); return Promise.resolve(); }
  }
  const made: FakeContext[] = [];
  const ramps: number[] = [];
  const node = () => ({ connect: (n: unknown) => n, context: { currentTime: 0 }, gain: { value: 1, setTargetAtTime() {}, cancelScheduledValues() {}, setValueAtTime() {}, linearRampToValueAtTime: (v: number) => void ramps.push(v) } });
  class FakeContext {
    state = "running";
    addEventListener() {}
    removeEventListener() {}
    currentTime = 0;
    destination = {};
    constructor() { made.push(this); }
    createMediaElementSource = node;
    createGain = node;
    suspend() { this.state = "suspended"; return Promise.resolve(); }
    resume() { this.state = "running"; return Promise.resolve(); }
  }
  (globalThis as any).Audio = FakeAudio;
  (globalThis as any).AudioContext = FakeContext;
  mock.timers.enable({ apis: ["setTimeout"] }); // the keeper's watch, which this context's still time would set off
  try {
    const { createMusic } = await import("./player.ts");
    const m = new Map<string, string>();
    const storage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
    const music = createMusic({ key: "t", songs: [{ id: "a", file: "a.mp3", title: "A" }], base: "", storage, mediaKeys: false, context: "own" });
    assert.equal(made.length, 0, "nothing made before the music plays");
    assert.equal(music.duck(), false, "no duck before Web Audio");
    music.start();
    assert.equal(made.length, 1);
    assert.equal(music.duck(), true);
    assert.deepEqual(ramps, [0.3, 1]);
    music.pause("popup");
    assert.equal(made[0].state, "suspended");
    await music.resume("popup");
    assert.equal(made[0].state, "running");
    // the game's away (Android's app paused, the page not hidden): asleep; back: awake
    music.setAway("app", true);
    assert.equal(made[0].state, "suspended");
    music.setAway("app", false);
    assert.equal(made[0].state, "running");
  } finally {
    mock.timers.reset();
    delete (globalThis as any).AudioContext;
  }
});

test("the duck: the music let down under a sound and back, on a gain after the volume's (Waddleberg's shape unless given)", async () => {
  const { duckSteps, DUCK } = await import("./duck.ts");
  assert.deepEqual(duckSteps(10).map((s) => [s.at, s.to]), [[10, 1], [10.18, DUCK.level], [11.68, DUCK.level], [12.78, 1]]);
  assert.equal(duckSteps(0, { level: 0.5, down: 100, hold: 0, up: 100 })[1].to, 0.5);
});
