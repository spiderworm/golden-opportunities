import { test } from "node:test";
import assert from "node:assert/strict";
import { loadManifest, parseManifest } from "./manifest.ts";

test("a bad entry is left out and counted, never played", () => {
  const m = parseManifest({
    songs: [
      { id: "nebula-waltz", file: "nebula-waltz.mp3", title: " Nebula Waltz ", pinned: true },
      { id: "Bad Id", file: "x.mp3", title: "X" },
      { id: "up", file: "../up.mp3", title: "Up" },
      { id: "nebula-waltz", file: "again.mp3", title: "Again" },
    ],
  });
  assert.deepEqual(m.songs, [{ id: "nebula-waltz", file: "nebula-waltz.mp3", title: "Nebula Waltz", pinned: true }]);
  assert.equal(m.skipped, 3);
  assert.deepEqual(parseManifest(null), { songs: [], skipped: 0 });
});

test("a list that can't be read is no songs", async () => {
  const down = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
  assert.deepEqual(await loadManifest("/music/songs.json", down), { songs: [], skipped: 0 });
  const ok = (async () => ({ ok: true, json: async () => ({ songs: [{ id: "a", file: "a.mp3", title: "A" }] }) })) as unknown as typeof fetch;
  assert.equal((await loadManifest("/music/songs.json", ok)).songs.length, 1);
});
