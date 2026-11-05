import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeBrowser } from "../sync/fake-browser.ts";

// a stand-in for <audio>: only what the player touches
class FakeAudio {
  volume = 1; preload = ""; paused = true; currentTime = 0; duration = 0; src = "";
  heard = new Map<string, (() => void)[]>();
  addEventListener(e: string, f: () => void) { this.heard.set(e, [...(this.heard.get(e) ?? []), f]); }
  removeAttribute() {}
  pause() { if (!this.paused) (this.paused = true), this.heard.get("pause")?.forEach((f) => f()); }
  play() { if (this.paused) (this.paused = false), this.heard.get("playing")?.forEach((f) => f()); return Promise.resolve(); }
}
(globalThis as any).Audio = FakeAudio;
// a page: oneTab runs only in one
(globalThis as any).window ??= globalThis;
(globalThis as any).document ??= { hidden: false, addEventListener() {} };
(globalThis as any).addEventListener ??= () => {};
(globalThis as any).removeEventListener ??= () => {};
const { createMusic } = await import("./player.ts");
const tick = () => new Promise((r) => setTimeout(r, 20));

test("a pause made in one of the app's tabs holds in a tab opened while it's still open (oneTab): the app didn't start again", async () => {
  const b = fakeBrowser();
  const m = new Map<string, string>();
  const storage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  const songs = ["a", "b", "c"].map((id) => ({ id, file: id + ".mp3", title: id.toUpperCase() }));
  const one = createMusic({ key: "o", songs, base: "", storage, remember: true, oneTab: b.options() });
  one.start();
  await tick();
  one.pause("dock");
  await tick();
  const two = createMusic({ key: "o", songs, base: "", storage, remember: true, oneTab: b.options() });
  await tick();
  assert.equal(two.state().paused, true);
});
