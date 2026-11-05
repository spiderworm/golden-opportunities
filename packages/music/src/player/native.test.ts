import { test } from "node:test";
import assert from "node:assert/strict";

// a stand-in for <audio>: only what the player touches
class FakeAudio {
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
  pause() {
    if (!this.paused) (this.paused = true), this.heard.get("pause")?.forEach((f) => f());
  }
  play() {
    if (this.paused) (this.paused = false), this.heard.get("playing")?.forEach((f) => f());
    return Promise.resolve();
  }
}
(globalThis as any).Audio = FakeAudio;
const { createMusic } = await import("./player.ts");
const { forgetNativeSession, nativeSession } = await import("./native.ts");

// an Android app's Capacitor, with the TellimMusic plugin
const capacitor = (available = true) => {
  const sent: object[] = [];
  let press: (e: { action: string }) => void = () => {};
  return {
    sent,
    press: (action: string) => press({ action }),
    isNativePlatform: () => true,
    isPluginAvailable: (name: string) => available && name === "TellimMusic",
    registerPlugin: () => ({
      set: (o: object) => (sent.push(o), Promise.resolve()),
      addListener: (_: string, f: typeof press) => ((press = f), Promise.resolve()),
    }),
  };
};
const storage = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};
const songs = ["a", "b"].map((id) => ({ id, file: id + ".mp3", title: id.toUpperCase() + " Song" }));

test("in an Android app, the plugin is the device's session: the earbuds' pause and play reach the player, and the app's told what's playing", () => {
  forgetNativeSession();
  const cap = capacitor();
  (globalThis as any).Capacitor = cap;
  try {
    const music = createMusic({ key: "t", songs, base: "", storage: storage(), mediaKeys: { album: "Pizza" } });
    music.start();
    assert.deepEqual(cap.sent.at(-1), { state: "playing", title: music.state().song!.title, album: "Pizza" });
    cap.press("pause");
    assert.equal(music.state().paused, true);
    assert.equal((cap.sent.at(-1) as { state: string }).state, "paused");
    cap.press("play");
    assert.equal(music.state().paused, false);
  } finally {
    delete (globalThis as any).Capacitor;
    forgetNativeSession();
  }
});

test("on the web, or an app without the plugin, there's no session of its own", () => {
  forgetNativeSession();
  assert.equal(nativeSession(undefined), undefined);
  forgetNativeSession();
  assert.equal(nativeSession(capacitor(false) as never), undefined);
  forgetNativeSession();
});
