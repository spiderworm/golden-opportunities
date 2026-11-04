// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createMusic = vi.hoisted(() => vi.fn((options: unknown) => ({ options })));
const track = vi.hoisted(() => vi.fn());
vi.mock("@tellim/music/player", () => ({ createMusic }));
vi.mock("@tellim/kit/music/music.css", () => ({}));
// the kit as the page starts it, without analytics (analytics.client's own tests have that)
const kit = vi.hoisted(() => ({ started: undefined as unknown }));
vi.mock("~/platform/kit.client", async () => {
  const { defineApp, startApp } = await import("@tellim/kit/app");
  const app = defineApp({ id: "orbital-books" });
  return {
    studio: () => (kit.started ??= startApp(app, { form: "desktop", analytics: false, track })),
  };
});

import { loadPrefs } from "../../../packages/music/src/prefs/prefs";
import { loadMusic, START_VOLUME } from "./music.client";

const respond = (body: unknown, ok = true) =>
  vi.fn(async () => ({ ok, json: async () => body }) as unknown as Response);

describe("loadMusic", () => {
  beforeEach(() => vi.stubGlobal("window", {}));
  afterEach(() => {
    kit.started = undefined;
    vi.unstubAllGlobals();
    createMusic.mockClear();
    track.mockClear();
  });

  it("makes no player for an empty manifest, so no music UI shows", async () => {
    expect(await loadMusic(respond({ songs: [] }))).toBeNull();
    expect(createMusic).not.toHaveBeenCalled();
  });

  it("makes no player when the manifest is missing or broken", async () => {
    expect(await loadMusic(respond(null, false))).toBeNull();
    kit.started = undefined;
    expect(await loadMusic(vi.fn(async () => Promise.reject(new Error("offline"))))).toBeNull();
    expect(createMusic).not.toHaveBeenCalled();
  });

  it("makes the player once, from public/music/, with the kit's desktop defaults, reporting through track", async () => {
    const fetcher = respond({
      songs: [{ id: "nebula-waltz", file: "nebula-waltz.mp3", title: "Nebula Waltz" }],
    });
    const [a, b] = await Promise.all([loadMusic(fetcher), loadMusic(fetcher)]);
    expect(a).toBe(b);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith("/music/songs.json", { cache: "no-cache" });
    expect(createMusic).toHaveBeenCalledTimes(1);
    expect(createMusic.mock.calls[0]![0]).toMatchObject({
      app: expect.objectContaining({ id: "orbital-books", storagePrefix: "orbital-books" }),
      base: "/music/",
      songs: [{ id: "nebula-waltz", file: "nebula-waltz.mp3", title: "Nebula Waltz" }],
      track,
      remember: true,
      oneTab: true,
      mediaKeys: { album: "Orbital Books" },
      pauseWhenHidden: expect.any(Function), // the desktop player's: plays on behind other tabs
    });
    // a computer (no touch screen here) plays on while hidden
    expect(
      (createMusic.mock.calls[0]![0] as { pauseWhenHidden: () => boolean }).pauseWhenHidden(),
    ).toBe(false);
  });

  it("starts a first-time player at 75%, and keeps a volume the player has set", async () => {
    await loadMusic(respond({ songs: [{ id: "a", file: "a.mp3", title: "A" }] }));
    const { legacyVolume } = createMusic.mock.calls[0]![0] as { legacyVolume: () => number | null };
    expect(START_VOLUME).toBe(0.75);
    // the player's own reading of it: only while nothing is saved
    const store = (saved?: object) => ({
      getItem: () => (saved ? JSON.stringify(saved) : null),
      setItem: () => {},
    });
    expect(loadPrefs("orbital-books", store(), legacyVolume).volume).toBe(0.75);
    expect(loadPrefs("orbital-books", store({ volume: 0.3 }), legacyVolume).volume).toBe(0.3);
    expect(loadPrefs("orbital-books", store({ volume: 1 }), legacyVolume).volume).toBe(1);
    expect(loadPrefs("orbital-books", store({ volume: 0 }), legacyVolume).volume).toBe(0);
  });

  it("counts entries left out, without naming them", async () => {
    await loadMusic(respond({ songs: [{ id: "x", file: "../x.mp3", title: "Secret Title" }] }));
    expect(track).toHaveBeenCalledWith("music_manifest_skipped", { skipped: 1 });
  });

  it("does nothing during server rendering", async () => {
    vi.unstubAllGlobals();
    const fetcher = respond({ songs: [{ id: "a", file: "a.mp3", title: "A" }] });
    expect(await loadMusic(fetcher)).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("starts paused, once, through the player's startPaused, when the entry page's Play the music was unticked", async () => {
    const page = { cookie: "ob_music=off" };
    vi.stubGlobal("document", page);
    await loadMusic(
      respond({ songs: [{ id: "nebula-waltz", file: "nebula-waltz.mp3", title: "Nebula Waltz" }] }),
    );
    expect(createMusic.mock.calls[0]![0]).toMatchObject({ startPaused: true, track });
    // The choice is cleared, so it applies to this start only.
    expect(page.cookie).toBe("ob_music=; Path=/; Max-Age=0; SameSite=Lax");
  });
  it("starts at once, once, when the entry page was just answered with the music on", async () => {
    const start = vi.fn();
    createMusic.mockImplementationOnce(
      (options) => ({ options, start, state: () => ({ song: null }) }) as never,
    );
    const page = { cookie: "ob_music=on" };
    vi.stubGlobal("document", page);
    await loadMusic(
      respond({ songs: [{ id: "nebula-waltz", file: "nebula-waltz.mp3", title: "Nebula Waltz" }] }),
    );
    expect(start).toHaveBeenCalledOnce();
    expect(page.cookie).toBe("ob_music=; Path=/; Max-Age=0; SameSite=Lax");
  });

  it("plays when the entry page was just answered with the music on, even over a pause the player remembers", async () => {
    const calls: string[] = [];
    createMusic.mockImplementationOnce((options) => {
      const o = options as { track: (event: string, props?: object) => void };
      return {
        options,
        state: () => ({ song: "nebula-waltz", paused: true }),
        start: () => calls.push("start"),
        resume: async () => (
          calls.push("resume"),
          o.track("music_resumed", { id: "nebula-waltz", where: "settings" }),
          true
        ),
      } as never;
    });
    const page = { cookie: "ob_music=on" };
    vi.stubGlobal("document", page);
    await loadMusic(
      respond({ songs: [{ id: "nebula-waltz", file: "nebula-waltz.mp3", title: "Nebula Waltz" }] }),
    );
    expect(calls).toEqual(["resume"]);
    expect(track).not.toHaveBeenCalledWith("music_resumed", expect.anything());
    expect(page.cookie).toBe("ob_music=; Path=/; Max-Age=0; SameSite=Lax");
  });
});
