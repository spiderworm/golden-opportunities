// @vitest-environment node
// Audit's probe on #65, against the studio's real player: a saved volume must
// hold from the first note, not only after the slider moves.
import { afterEach, expect, it, vi } from "vitest";
import { createMusic } from "@tellim/kit/music/player";
import { musicContext, resetMusicContext } from "./audio-context";

class Deck extends EventTarget {
  volume = 1;
  paused = true;
  preload = "";
  src = "";
  currentTime = 0;
  duration = 1;
  pause() {
    this.paused = true;
  }
  removeAttribute() {}
  play() {
    this.paused = false;
    return Promise.resolve();
  }
}

/** A Web Audio context that records the gain the player sets. */
class FakeContext {
  static made = 0;
  state = "running";
  destination = {};
  currentTime = 0;
  gains: { gain: { value: number; setTargetAtTime: (v: number) => void } }[] = [];
  constructor() {
    FakeContext.made++;
  }
  createMediaElementSource() {
    return { connect: (node: unknown) => node };
  }
  createGain() {
    const gain = { gain: { value: 1, setTargetAtTime: (v: number) => void (gain.gain.value = v) }, connect: (node: unknown) => node, context: this };
    this.gains.push(gain);
    return gain;
  }
  resume() {
    return Promise.resolve();
  }
}

function setUp(volume: number) {
  const gestures = new Map<string, EventListener>();
  let deck!: Deck;
  vi.stubGlobal("Audio", class extends Deck {
    constructor() {
      super();
      deck = this;
    }
  });
  vi.stubGlobal("document", { hidden: false, addEventListener() {} });
  vi.stubGlobal("addEventListener", (name: string, listener: EventListener) => gestures.set(name, listener));
  vi.stubGlobal("removeEventListener", () => {});
  const music = createMusic({
    key: "test",
    base: "/music/",
    songs: [{ id: "song", file: "song.wav", title: "Song" }],
    context: musicContext,
    storage: { getItem: () => JSON.stringify({ volume }), setItem() {} },
  });
  return { music, gestures, deck: () => deck };
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetMusicContext();
  FakeContext.made = 0;
});

it("plays a saved 20% at 20% from the first note, through Web Audio (Audit's probe)", () => {
  vi.stubGlobal("AudioContext", FakeContext);
  const { music, gestures, deck } = setUp(0.2);
  expect(music.state().volume).toBe(0.2);
  // Nothing, not even the context, before a gesture.
  expect(deck().paused).toBe(true);
  expect(FakeContext.made).toBe(0);
  gestures.get("pointerdown")!(new Event("pointerdown"));
  expect(deck().paused).toBe(false);
  const ctx = musicContext() as unknown as FakeContext;
  expect(FakeContext.made).toBe(1);
  // The package's curve: volume squared, times its loudness (0.55).
  expect(ctx.gains[0]!.gain.value).toBeCloseTo(0.2 ** 2 * 0.55);
  expect(deck().volume).toBe(1);
});

it("keeps a saved mute silent", () => {
  vi.stubGlobal("AudioContext", FakeContext);
  const { gestures, deck } = setUp(0);
  gestures.get("pointerdown")!(new Event("pointerdown"));
  expect(deck().paused).toBe(true);
});

it("has no context where the browser has no Web Audio", () => {
  expect(musicContext()).toBeNull();
});
