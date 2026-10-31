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
const { createDesktopMusic } = await import("./desktop.ts");

const storage = () => {
  const m = new Map<string, string>();
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};
const songs = [{ id: "a", file: "a.mp3", title: "A" }];

test("desktop: it remembers, and plays on behind other tabs, unless told otherwise", () => {
  (globalThis as any).document = { hidden: true };
  try {
    const s = storage();
    const m = createDesktopMusic({ key: "d", songs, base: "", storage: s });
    m.start();
    assert.equal(FakeAudio.made.at(-1)!.src, "a.mp3");
    m.pause("dock"); // saves where it is
    assert.ok(s.m.has("d.music.session"));

    createDesktopMusic({ key: "d", songs, base: "", storage: storage(), pauseWhenHidden: true }).start();
    assert.equal(FakeAudio.made.at(-1)!.src, "");
  } finally {
    delete (globalThis as any).document;
  }
  const t = storage();
  const n = createDesktopMusic({ key: "d", songs, base: "", storage: t, remember: false });
  n.start();
  assert.equal(FakeAudio.made.at(-1)!.src, "a.mp3");
  n.pause("dock");
  assert.ok(!t.m.has("d.music.session"));
});

test("desktop: on a touch screen, a hidden page still pauses it", () => {
  (globalThis as any).document = { hidden: true };
  (globalThis as any).matchMedia = (q: string) => ({ matches: q === "(pointer: coarse)" });
  try {
    createDesktopMusic({ key: "d", songs, base: "", storage: storage() }).start();
    assert.equal(FakeAudio.made.at(-1)!.src, "");
  } finally {
    delete (globalThis as any).document;
    delete (globalThis as any).matchMedia;
  }
});
