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

test("remember: after a reload it carries on with the same song, and a pause the player chose holds", () => {
  const m = new Map<string, string>();
  const storage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  const list = ["a", "b", "c", "d"].map((id) => ({ id, file: id + ".mp3", title: id.toUpperCase() }));
  const first = createMusic({ key: "r", songs: list, base: "", storage, remember: true });
  first.start();
  const playing = first.state().song!.id;
  FakeAudio.made.at(-1)!.currentTime = 42;
  first.pause("dock");

  const again = createMusic({ key: "r", songs: list, base: "", storage, remember: true });
  assert.equal(again.state().song?.id, playing);
  again.start(); // a tap: but the player paused it
  assert.equal(FakeAudio.made.at(-1)!.src, "");
  assert.equal(JSON.parse(m.get("r.music.session")!).t, 42);

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
