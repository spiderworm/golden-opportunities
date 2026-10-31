// The kit's parts together, at the versions beside it: platform's app,
// analytics started for it, the music with its form's defaults.
import { test } from "node:test";
import assert from "node:assert/strict";

class FakeAudio {
  volume = 1;
  preload = "";
  paused = true;
  currentTime = 0;
  duration = 0;
  src = "";
  addEventListener() {}
  removeAttribute() {}
  pause() {}
  play() {
    return Promise.resolve();
  }
}
(globalThis as any).Audio = FakeAudio;
(globalThis as any).window ??= globalThis; // a browser, as far as the music asks
const { defineApp, startApp } = await import("./app.ts");

const store = () => {
  const m = new Map<string, string>();
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};
const env = { userAgent: "test", webdriver: false, search: "" };
const songs = [{ id: "a", file: "a.mp3", title: "A" }];

test("analytics starts for the app: its storage, and its track is what the music reports through", async () => {
  const s = store();
  const app = defineApp({ id: "waddleberg", build: "b1" });
  const kit = startApp(app, { form: "phone", analytics: { endpoint: undefined, storage: s, env } });
  assert.ok(kit.analytics);
  kit.track("hello");
  assert.ok([...s.m.keys()].some((k) => k.startsWith("cubeberg.")), [...s.m.keys()].join());
  startApp(app, { form: "phone", analytics: false }); // none: still starts
});

test("a computer's web app: the music remembers where it was; a phone game's doesn't", async () => {
  const app = defineApp({ id: "orbital-books" });
  const desk = store();
  const music = await startApp(app, { form: "desktop", analytics: false }).music({ songs, base: "", storage: desk, oneTab: false });
  music!.start();
  music!.pause("dock");
  assert.ok(desk.m.has("orbital-books.music.session"));

  const phone = store();
  const game = await startApp(app, { form: "phone", analytics: false }).music({ songs, base: "", storage: phone });
  game!.start();
  game!.pause("dock");
  assert.ok(!phone.m.has("orbital-books.music.session"));
});

test("the music is made once, from a song list read at run time; none listed is no music", async () => {
  const app = defineApp({ id: "orbital-books" });
  const said: string[] = [];
  const list = (songs: unknown[]) => (async () => ({ ok: true, json: async () => ({ songs }) })) as unknown as typeof fetch;
  const kit = startApp(app, { form: "desktop", analytics: false, track: (e) => said.push(e) });
  const first = kit.music({ songs: { manifest: "/music/songs.json", fetcher: list([...songs, { id: "Bad", file: "x", title: "" }]) }, base: "/music/", storage: store(), oneTab: false });
  assert.equal(kit.music({ songs: [], base: "" }), first);
  assert.ok(await first);
  assert.deepEqual(said, ["music_manifest_skipped"]);
  const none = startApp(app, { form: "desktop", analytics: false });
  assert.equal(await none.music({ songs: { manifest: "/music/songs.json", fetcher: list([]) }, base: "/music/" }), null);
});
