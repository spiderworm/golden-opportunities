// The music, made for the app with its form's defaults (David, 31 Oct 2026:
// so a web app made for a computer doesn't learn them again). A computer:
// createDesktopMusic's (remember, its tabs as one app, playing on behind
// other tabs, paused out of sight only on a touch screen). A phone: the
// player's own (paused out of sight, as a game's music should be). Anything
// given wins.
import { createDesktopMusic } from "@tellim/music/desktop";
import { loadManifest } from "@tellim/music/manifest";
import { createMusic, type Music, type MusicOptions, type Song } from "@tellim/music/player";
import type { App } from "@tellim/platform/app";

export type Form = "desktop" | "phone";

export type MusicStart = Omit<MusicOptions, "app" | "key" | "songs"> & {
  /** the songs, or where their list is read (a songs.json, checked: a bad entry is left out) */
  songs: Song[] | { manifest: string; fetcher?: typeof fetch };
};

/** The music, or null when there are no songs (or no browser). */
export async function startMusic(app: App, form: Form, o: MusicStart): Promise<Music | null> {
  if (typeof window === "undefined") return null;
  let songs: Song[];
  if (Array.isArray(o.songs)) songs = o.songs;
  else {
    const m = await loadManifest(o.songs.manifest, o.songs.fetcher);
    if (m.skipped) o.track?.("music_manifest_skipped", { skipped: m.skipped });
    songs = m.songs;
  }
  if (!songs.length) return null;
  const options = { ...o, app, songs };
  return form === "desktop" ? createDesktopMusic(options) : createMusic(options);
}
