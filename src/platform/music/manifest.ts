// The songs David drops into public/music/, listed in songs.json (the folder's
// ADDING-SONGS.md says how). Read in the browser, so every entry is checked:
// a bad one is left out, never played.
import type { Song } from "@tellim/music/player";

export const MANIFEST_URL = "/music/songs.json";
export const MAX_SONGS = 200;

/** Lowercase words and hyphens: kept forever as the song's id in hearts, exclusions and analytics. */
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** A plain file name in public/music/, with an audio extension. */
const FILE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.(?:mp3|m4a|ogg|wav)$/;

export interface Manifest {
  songs: Song[];
  /** Entries left out because they weren't valid. */
  skipped: number;
}

export function parseManifest(value: unknown): Manifest {
  const entries = (value as { songs?: unknown } | null)?.songs;
  if (!Array.isArray(entries)) return { songs: [], skipped: 0 };
  const songs: Song[] = [];
  let skipped = 0;
  for (const entry of entries.slice(0, MAX_SONGS)) {
    const e = entry as Partial<Record<keyof Song, unknown>> | null;
    const ok =
      typeof e?.id === "string" && e.id.length <= 64 && ID.test(e.id)
      && typeof e.file === "string" && e.file.length <= 128 && FILE.test(e.file)
      && typeof e.title === "string" && e.title.trim().length > 0 && e.title.length <= 120
      && (e.pinned === undefined || typeof e.pinned === "boolean")
      && !songs.some((s) => s.id === e.id);
    if (!ok) {
      skipped++;
      continue;
    }
    songs.push({ id: e.id as string, file: e.file as string, title: (e.title as string).trim(), ...(e.pinned ? { pinned: true } : {}) });
  }
  return { songs, skipped: skipped + Math.max(0, entries.length - MAX_SONGS) };
}
