import { test } from "node:test";
import assert from "node:assert/strict";

// a stand-in for <audio>: only what the player touches
class FakeAudio {
  static made: FakeAudio[] = [];
  volume = 1;
  preload = "";
  paused = true;
  currentTime = 0;
  duration = 0;
  src = "";
  constructor() {
    FakeAudio.made.push(this);
  }
  addEventListener() {}
  removeAttribute() {}
  pause() {}
  play() {
    return Promise.resolve();
  }
}
(globalThis as any).Audio = FakeAudio;
const { createMusic } = await import("./player.ts");

const store = (saved: object) => {
  const m = new Map([["t.music", JSON.stringify(saved)]]);
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};
const songs = [{ id: "a", file: "a.mp3", title: "A" }];

test("without Web Audio, the element starts at the player's level, not full volume", () => {
  createMusic({ key: "t", songs, base: "", storage: store({ volume: 0.2 }) });
  const deck = FakeAudio.made.at(-1)!;
  assert.ok(Math.abs(deck.volume - 0.2 ** 2 * 0.55) < 1e-9, String(deck.volume));
});

test("at full volume it's the loudness, and Mute is silent", () => {
  createMusic({ key: "t", songs, base: "", storage: store({ volume: 1 }), loudness: 0.5 });
  assert.equal(FakeAudio.made.at(-1)!.volume, 0.5);
  const m = createMusic({ key: "t", songs, base: "", storage: store({ volume: 0.6 }) });
  m.setVolume(0);
  assert.equal(FakeAudio.made.at(-1)!.volume, 0);
});

test("remember: after a reload it carries on with the same song, and a pause is over (David, 5 Nov 2026: a pause ends when the app restarts)", () => {
  const m = new Map<string, string>();
  const storage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  const list = ["a", "b", "c", "d"].map((id) => ({ id, file: id + ".mp3", title: id.toUpperCase() }));
  const first = createMusic({ key: "r", songs: list, base: "", storage, remember: true });
  first.start();
  const playing = first.state().song!.id;
  FakeAudio.made.at(-1)!.currentTime = 42;
  first.pause("dock");

  assert.equal(JSON.parse(m.get("r.music.session")!).paused, true);

  const again = createMusic({ key: "r", songs: list, base: "", storage, remember: true });
  assert.equal(again.state().song?.id, playing);
  assert.equal(again.state().paused, false);
  again.start(); // a tap: on with the song, from where it was
  assert.equal(FakeAudio.made.at(-1)!.src, playing + ".mp3");
  assert.equal(JSON.parse(m.get("r.music.session")!).t, 42);

  // keepPause: the pause holds, so the dock's play resumes it (a tap won't)
  m.set("r.music.session", JSON.stringify({ ...JSON.parse(m.get("r.music.session")!), paused: true }));
  const kept = createMusic({ key: "r", songs: list, base: "", storage, remember: { keepPause: true } });
  assert.equal(kept.state().song?.id, playing);
  assert.equal(kept.state().paused, true);
  kept.start();
  assert.equal(FakeAudio.made.at(-1)!.src, "");

  // an old session starts afresh
  m.set("r.music.session", JSON.stringify({ ...JSON.parse(m.get("r.music.session")!), at: Date.now() - 7 * 3600_000 }));
  const later = createMusic({ key: "r", songs: list, base: "", storage, remember: true });
  assert.equal(later.state().song, null);
});

test("pauseWhenHidden: a hidden page starts no music, unless the game says it may play behind", () => {
  (globalThis as any).document = { hidden: true };
  try {
    createMusic({ key: "h", songs, base: "", storage: store({}) }).start();
    assert.equal(FakeAudio.made.at(-1)!.src, "");
    createMusic({ key: "h", songs, base: "", storage: store({}), pauseWhenHidden: () => true }).start();
    assert.equal(FakeAudio.made.at(-1)!.src, "");
    createMusic({ key: "h", songs, base: "", storage: store({}), pauseWhenHidden: false }).start();
    assert.equal(FakeAudio.made.at(-1)!.src, "a.mp3");
  } finally {
    delete (globalThis as any).document;
  }
});

test("the app's storage, from @tellim/platform, is where its choices are kept", () => {
  const m = new Map([["cubeberg.music", JSON.stringify({ volume: 0.3 })]]);
  const storage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  createMusic({ app: { id: "waddleberg", storagePrefix: "cubeberg" }, songs, base: "", storage }).setVolume(0.4);
  assert.equal(JSON.parse(m.get("cubeberg.music")!).volume, 0.4);
  assert.throws(() => createMusic({ songs, base: "" }));
});

test("startPaused: the first song waits, paused, for the player's play, with nothing reported, and a reload still started paused holds it", async () => {
  const m = new Map<string, string>();
  const storage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  const events: string[] = [];
  const list = ["a", "b", "c"].map((id) => ({ id, file: id + ".mp3", title: id.toUpperCase() }));
  const music = createMusic({ key: "p", songs: list, base: "", storage, remember: true, startPaused: true, track: (e) => void events.push(e) });
  const queued = music.state().song;
  assert.ok(queued);
  assert.equal(music.state().paused, true);
  music.start(); // a tap: but it starts paused
  assert.equal(FakeAudio.made.at(-1)!.src, "");
  assert.deepEqual(events, []);

  const again = createMusic({ key: "p", songs: list, base: "", storage, remember: true, startPaused: true });
  assert.equal(again.state().song?.id, queued!.id);
  assert.equal(again.state().paused, true);
  await again.resume("dock");
  assert.equal(FakeAudio.made.at(-1)!.src, queued!.file);
  assert.equal(again.state().paused, false);
});

test("startPaused with a session restored: that song, paused", async () => {
  const m = new Map<string, string>();
  const storage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  const list = ["a", "b", "c", "d"].map((id) => ({ id, file: id + ".mp3", title: id.toUpperCase() }));
  const first = createMusic({ key: "q", songs: list, base: "", storage, remember: true });
  first.start();
  const playing = first.state().song!.id;
  first.pause("dock");
  await first.resume("dock"); // saved as playing
  const again = createMusic({ key: "q", songs: list, base: "", storage, remember: true, startPaused: true });
  assert.equal(again.state().song?.id, playing);
  assert.equal(again.state().paused, true);
});

test("status: on, paused (the player's pause), or off (the volume at Mute, which wins over a pause)", () => {
  const music = createMusic({ key: "s", songs, base: "", storage: store({}) });
  music.start();
  assert.equal(music.status(), "on");
  music.pause("settings");
  assert.equal(music.status(), "paused");
  music.setVolume(0);
  assert.equal(music.status(), "off");
});

test("play at Mute comes back to the volume last set, once its slider was let go (not each point of a drag), or full without one", async () => {
  const saved = new Map<string, string>();
  const storage = { getItem: (k: string) => saved.get(k) ?? null, setItem: (k: string, v: string) => void saved.set(k, v) };
  const music = createMusic({ key: "m", songs, base: "", storage });
  const deck = FakeAudio.made.at(-1)!;
  music.start();
  // a drag: 0.6, 0.4, let go at 0.4
  music.setVolume(0.6);
  music.setVolume(0.4);
  music.volumeSettled("settings");
  // a drag down to Mute, let go there
  music.setVolume(0.2);
  music.setVolume(0);
  music.volumeSettled("settings");
  assert.equal(music.status(), "off");
  music.start(); // a touch: still Mute
  assert.equal(music.volume(), 0);
  await music.resume("popup"); // the play button
  assert.equal(music.volume(), 0.4);
  assert.ok(Math.abs(deck.volume - 0.4 ** 2 * 0.55) < 1e-9, "heard at it");
  // kept: the next open comes back to it too
  const again = createMusic({ key: "m", songs, base: "", storage });
  again.setVolume(0);
  await again.resume("dock");
  assert.equal(again.volume(), 0.4);
  // never set: full
  const fresh = createMusic({ key: "n", songs, base: "", storage: store({ volume: 0 }) });
  await fresh.resume("popup");
  assert.equal(fresh.volume(), 1);
});
