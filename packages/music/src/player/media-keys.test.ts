import { test } from "node:test";
import assert from "node:assert/strict";

// a stand-in for <audio>: only what the player touches
class FakeAudio {
  static last: FakeAudio;
  constructor() {
    FakeAudio.last = this;
  }
  volume = 1;
  preload = "";
  paused = true;
  currentTime = 0;
  duration = 0;
  src = "";
  heard = new Map<string, (() => void)[]>();
  addEventListener(e: string, f: () => void) {
    this.heard.set(e, [...(this.heard.get(e) ?? []), f]);
  }
  removeAttribute() {}
  fire(e: string) {
    this.heard.get(e)?.forEach((f) => f());
  }
  pause() {
    if (!this.paused) (this.paused = true), this.fire("pause");
  }
  play() {
    if (this.paused) (this.paused = false), this.fire("playing");
    return Promise.resolve();
  }
}
(globalThis as any).Audio = FakeAudio;
(globalThis as any).MediaMetadata = class {
  constructor(init: object) {
    Object.assign(this, init);
  }
};
const { createMusic } = await import("./player.ts");
const { mediaKeys } = await import("./media-keys.ts");

// the browser's Media Session, pressing the device's buttons
const session = () => {
  const handlers = new Map<string, (() => void) | null>();
  return {
    handlers,
    metadata: null as unknown,
    playbackState: "none" as MediaSessionPlaybackState,
    setActionHandler(action: string, f: (() => void) | null) {
      handlers.set(action, f);
    },
    press(action: string) {
      handlers.get(action)?.();
    },
  };
};
const storage = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};
const songs = ["a", "b", "c"].map((id) => ({ id, file: id + ".mp3", title: id.toUpperCase() + " Song" }));
const made = () => {
  const events: [string, object | undefined][] = [];
  const music = createMusic({ key: "t", songs, base: "", storage: storage(), mediaKeys: false, track: (e, p) => void events.push([e, p]) });
  const s = session();
  const undo = mediaKeys(music, { album: "Orbital Books" }, s);
  return { music, s, events, undo };
};

test("the device's pause is the player's pause, and its play carries on", async () => {
  const { music, s, events } = made();
  music.start();
  assert.equal(s.playbackState, "playing");
  s.press("pause");
  assert.equal(music.state().paused, true);
  assert.equal(s.playbackState, "paused");
  assert.ok(events.some(([e, p]) => e === "music_paused" && (p as any).where === "device"));
  s.press("play");
  await Promise.resolve();
  assert.equal(music.state().paused, false);
  assert.equal(s.playbackState, "playing");
});

test("next skips and previous goes back, from the device", async () => {
  const { music, s } = made();
  music.start();
  const first = music.state().song;
  s.press("nexttrack");
  await Promise.resolve();
  assert.notEqual(music.state().song, first);
  s.press("previoustrack");
  await Promise.resolve();
  assert.equal(music.state().song, first);
});

test("the device names the song playing, with what the game gives besides", async () => {
  const { music, s } = made();
  assert.equal(s.metadata, null);
  music.start();
  assert.deepEqual({ ...(s.metadata as object) }, { title: music.state().song!.title, album: "Orbital Books" });
  s.press("nexttrack");
  await Promise.resolve();
  assert.equal((s.metadata as { title: string }).title, music.state().song!.title);
});

test("play after something else stopped it (not the player) carries on", () => {
  const { music, s } = made();
  music.start();
  FakeAudio.last.pause(); // say, the headset went away
  assert.equal(music.state().playing, false);
  s.press("play");
  assert.equal(music.state().playing, true);
});

test("undone, the device's buttons are given back", () => {
  const { s, undo } = made();
  assert.equal(typeof s.handlers.get("play"), "function");
  undo();
  for (const a of ["play", "pause", "stop", "nexttrack", "previoustrack"]) assert.equal(s.handlers.get(a), null);
  assert.equal(s.playbackState, "none");
});

test("without a Media Session, nothing happens", () => {
  const music = createMusic({ key: "t", songs, base: "", storage: storage(), mediaKeys: false });
  assert.doesNotThrow(() => mediaKeys(music, {}, undefined)());
});

test("an app's own session, given where the browser has none, gets the buttons and the song's name", async () => {
  const s = session();
  const Metadata = (globalThis as any).MediaMetadata;
  delete (globalThis as any).MediaMetadata; // as in Android's WebView
  try {
    const music = createMusic({ key: "t", songs, base: "", storage: storage(), mediaKeys: { album: "Waddleberg", session: s } });
    music.start();
    assert.deepEqual(s.metadata, { title: music.state().song!.title, album: "Waddleberg" });
    assert.equal(s.playbackState, "playing");
    s.press("pause");
    assert.equal(music.state().paused, true);
    assert.equal(s.playbackState, "paused");
  } finally {
    (globalThis as any).MediaMetadata = Metadata;
  }
});

test("the device's play at Mute is the player's play: back to the volume last set", () => {
  const { music, s } = made();
  music.start();
  music.setVolume(0.5);
  music.volumeSettled("settings");
  music.setVolume(0);
  music.volumeSettled("settings");
  s.press("play");
  assert.equal(music.volume(), 0.5);
});
