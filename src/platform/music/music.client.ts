// The game's music: the studio's player (@tellim/music), made once in the
// browser and only if public/music/songs.json lists any songs. Shared by the
// shell's pop-up and the Settings panel. It starts on the player's first tap
// or key press (the package waits for one), plays nothing at volume 0 (the
// player's own saved choice), and reports through the platform's track,
// by song id, never title.
import { createMusic, type Music } from "@tellim/music/player";
import "@tellim/music/music.css";

import { track } from "~/platform/analytics/analytics.client";
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
    return createMusic({ key: "orbital-books", base: "/music/", songs: manifest.songs, track });
  })();
  return loading;
}

/** For tests: forget the music made. */
export function resetMusic(): void {
  loading = undefined;
}
