import { afterAll, expect, it, vi } from "vitest";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
const directory = await vi.hoisted(async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  return mkdtempSync(tmpdir() + "/orbital-segments-");
});
vi.mock("../platform/analytics/instance.server", () => ({
  DATA_DIR: directory,
  instanceId: () => "0123abcd-0000-4000-8000-000000000000",
}));
vi.mock("../platform/analytics/analytics.server", () => ({ trackServer: vi.fn() }));
import { saves } from "../game/session.server";
import { SaveError } from "../game/store.server";
import { applySegmentChange } from "./segments";

afterAll(() => rmSync(directory, { recursive: true, force: true }));

it("keeps the player's segments in the save without ending a query grant, and clears them when the last goes", () => {
  const save = saves.create();
  const written = saves.writeSegments(save.id, (s) => {
    const made = applySegmentChange(
      s.segments ?? [],
      { intent: "create", name: "Awarded paperbacks", filters: { awarded: ["yes"] } },
      () => "seg-1",
    );
    return made.ok ? made.segments : null;
  })!;
  expect(written.segments).toEqual([
    { id: "seg-1", name: "Awarded paperbacks", filters: { awarded: ["yes"] } },
  ]);
  // Not query data: a Dewey answer in flight keeps its grant, as with reports.
  expect(written.queryRevision).toBe(save.revision);
  expect(saves.read(save.id).segments).toHaveLength(1);
  // A refused change writes nothing.
  expect(saves.writeSegments(save.id, () => null)).toBeNull();
  const emptied = saves.writeSegments(save.id, () => [])!;
  expect(emptied.segments).toBeUndefined();
});

it("refuses a save whose segments were hand-edited past the rules", () => {
  const save = saves.create();
  expect(() =>
    saves.writeSegments(save.id, () => [
      { id: "a", name: "One", filters: { genre: ["Fiction"] } },
      { id: "b", name: "one", filters: { genre: ["Mystery"] } },
    ]),
  ).toThrow(SaveError);
  const file = path.join(directory, "saves", `${save.id}.json`);
  const stored = JSON.parse(readFileSync(file, "utf8"));
  writeFileSync(
    file,
    JSON.stringify({ ...stored, segments: [{ id: "a", name: "One", filters: { shelf: ["A"] } }] }),
  );
  expect(() => saves.read(save.id)).toThrow(SaveError);
});

it("starts a new game with no segments", () => {
  expect(saves.create().segments).toBeUndefined();
});
