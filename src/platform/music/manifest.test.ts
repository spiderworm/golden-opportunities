import { describe, expect, it } from "vitest";
import { MAX_SONGS, parseManifest } from "./manifest";

describe("the songs manifest", () => {
  it("reads David's songs, pinned ones kept pinned", () => {
    expect(
      parseManifest({
        songs: [
          { id: "nebula-waltz", file: "nebula-waltz.mp3", title: " Nebula Waltz ", pinned: true },
          { id: "ring-c-at-night", file: "Ring_C.m4a", title: "Ring C at Night" },
        ],
      }),
    ).toEqual({
      songs: [
        { id: "nebula-waltz", file: "nebula-waltz.mp3", title: "Nebula Waltz", pinned: true },
        { id: "ring-c-at-night", file: "Ring_C.m4a", title: "Ring C at Night" },
      ],
      skipped: 0,
    });
  });

  it("is empty for an empty or missing list", () => {
    expect(parseManifest({ songs: [] })).toEqual({ songs: [], skipped: 0 });
    expect(parseManifest(null)).toEqual({ songs: [], skipped: 0 });
    expect(parseManifest({ songs: "nebula-waltz.mp3" })).toEqual({ songs: [], skipped: 0 });
  });

  it("leaves out entries that aren't safe or well formed", () => {
    const good = { id: "a", file: "a.mp3", title: "A" };
    const { songs, skipped } = parseManifest({
      songs: [
        good,
        { ...good }, // the same id again
        { id: "Bad Id", file: "b.mp3", title: "B" },
        { id: "c", file: "../secrets.mp3", title: "C" },
        { id: "d", file: "https://elsewhere.example/d.mp3", title: "D" },
        { id: "e", file: "e.exe", title: "E" },
        { id: "f", file: "f.mp3", title: "   " },
        { id: "g", file: "g.mp3", title: "G", pinned: "yes" },
        null,
      ],
    });
    expect(songs.map((s) => s.id)).toEqual(["a"]);
    expect(skipped).toBe(8);
  });

  it("reads at most MAX_SONGS songs", () => {
    const many = Array.from({ length: MAX_SONGS + 5 }, (_, i) => ({ id: `s${i}`, file: `s${i}.mp3`, title: `S${i}` }));
    const { songs, skipped } = parseManifest({ songs: many });
    expect(songs).toHaveLength(MAX_SONGS);
    expect(skipped).toBe(5);
  });
});
