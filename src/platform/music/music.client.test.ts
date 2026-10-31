// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createMusic = vi.hoisted(() => vi.fn((options: unknown) => ({ options })));
const track = vi.hoisted(() => vi.fn());
vi.mock("@tellim/music/player", () => ({ createMusic }));
vi.mock("@tellim/music/music.css", () => ({}));
vi.mock("~/platform/analytics/analytics.client", () => ({ track }));

import { loadMusic, resetMusic } from "./music.client";

const respond = (body: unknown, ok = true) => vi.fn(async () => ({ ok, json: async () => body }) as unknown as Response);

describe("loadMusic", () => {
  beforeEach(() => vi.stubGlobal("window", {}));
  afterEach(() => {
    resetMusic();
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
    resetMusic();
    expect(await loadMusic(vi.fn(async () => Promise.reject(new Error("offline"))))).toBeNull();
    expect(createMusic).not.toHaveBeenCalled();
  });

  it("makes the player once, from public/music/, reporting through track", async () => {
    const fetcher = respond({ songs: [{ id: "nebula-waltz", file: "nebula-waltz.mp3", title: "Nebula Waltz" }] });
    const [a, b] = await Promise.all([loadMusic(fetcher), loadMusic(fetcher)]);
    expect(a).toBe(b);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith("/music/songs.json", { cache: "no-cache" });
    expect(createMusic).toHaveBeenCalledTimes(1);
    expect(createMusic.mock.calls[0]![0]).toMatchObject({
      key: "orbital-books",
      base: "/music/",
      songs: [{ id: "nebula-waltz", file: "nebula-waltz.mp3", title: "Nebula Waltz" }],
      track,
      remember: true,
      oneTab: true,
      pauseWhenHidden: expect.any(Function), // the desktop player's: plays on behind other tabs
    });
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
});
