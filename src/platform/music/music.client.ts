// The game's music: the studio's player (@tellim/music), made once in the
// browser and only if public/music/songs.json lists any songs. Shared by the
// shell's dock and the Settings panel. It starts on the player's first tap
// or key press (the package waits for one), plays nothing at volume 0 (the
// player's own saved choice, applied from the first note), and reports through the platform's track,
// by song id, never title.
//
// It carries on after a reload, a closed tab or a crash (remember), and
// plays in one tab at a time (oneTab) (David, 30 Oct 2026).
import { createMusic, type Music } from "@tellim/music/player";
import "@tellim/music/music.css";

import { track } from "~/platform/analytics/analytics.client";
import { musicContext } from "./audio-context";
import { MANIFEST_URL, parseManifest } from "./manifest";

let loading: Promise<Music | null> | undefined;

/** The music, or null when there are no songs (or no browser). Made once. */
export function loadMusic(fetcher: typeof fetch = fetch): Promise<Music | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  loading ??= (async () => {
    let manifest;
    try {
      const response = await fetcher(MANIFEST_URL, { cache: "no-cache" });
      manifest = parseManifest(response.ok ? await response.json() : null);
    } catch {
      manifest = parseManifest(null);
    }
    if (manifest.skipped) track("music_manifest_skipped", { skipped: manifest.skipped });
    if (!manifest.songs.length) return null;
    // Through Web Audio, so the saved volume holds from the first note (audio-context.ts).
    return createMusic({ key: "orbital-books", base: "/music/", songs: manifest.songs, track, context: musicContext, remember: true, oneTab: true });
  })();
  return loading;
}

/** For tests: forget the music made. */
export function resetMusic(): void {
  loading = undefined;
}
