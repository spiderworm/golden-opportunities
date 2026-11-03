import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
const directory = await vi.hoisted(async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  return mkdtempSync(tmpdir() + "/commit-retry-");
});
vi.mock("../platform/analytics/instance.server", () => ({
  DATA_DIR: directory,
  instanceId: () => "0123abcd-0000-4000-8000-000000000000",
}));
vi.mock("../platform/analytics/analytics.server", () => ({ trackServer: vi.fn() }));
import { submitPlan, submitQ2Plan } from "./game.server";
import { saves } from "./session.server";
import { SaveError } from "./store.server";
import type { GameSave } from "./types";

afterAll(() => rmSync(directory, { recursive: true, force: true }));
afterEach(() => vi.restoreAllMocks());
const request = (id: string) =>
  new Request("http://localhost/decide", {
    method: "POST",
    headers: { origin: "http://localhost", cookie: "orbital_save=" + id },
  });
const update = saves.update.bind(saves);
/** The next commit finds another write landed first, as Alma's record or the backstory does in the background. */
function landFirst(change: (draft: GameSave) => void) {
  vi.spyOn(saves, "update").mockImplementationOnce((id, revision, own) => {
    update(id, saves.read(id).revision, change);
    return update(id, revision, own);
  });
}

describe("a background write landing during the player's submit (Goldy)", () => {
  it("never fails the submit when it changes nothing the quarter was worked out from", () => {
    const save = saves.create();
    landFirst((draft) => {
      draft.alertSeen = true;
    });
    expect(() => submitPlan(request(save.id), { levers: [] })).not.toThrow();
    landFirst((draft) => {
      draft.alertsSeen = ["2194-Q2"];
    });
    expect(() =>
      submitQ2Plan(request(save.id), { picks: [null, null, null], levers: [] }),
    ).not.toThrow();
    const after = saves.read(save.id);
    expect(after.played.map((q) => q.period)).toEqual(["2194-Q1", "2194-Q2"]);
    // Both writes kept: the player's quarter and the background's field.
    expect(after).toMatchObject({ alertSeen: true, alertsSeen: ["2194-Q2"] });
  });

  it("still refuses when it changed what the quarter was worked out from, and never plays a quarter twice", () => {
    const save = saves.create();
    landFirst((draft) => {
      draft.discoveries = ["A"];
    });
    expect(() => submitPlan(request(save.id), { levers: [] })).toThrow(
      expect.objectContaining({ status: 409 }),
    );
    expect(saves.read(save.id).played).toEqual([]);
    // Another tab played the quarter first: its own transaction refuses the repeat.
    submitPlan(request(save.id), { levers: [] });
    expect(() => submitPlan(request(save.id), { levers: [] })).toThrow(
      expect.objectContaining({ status: 409 }),
    );
    expect(saves.read(save.id).played).toHaveLength(1);
  });

  it("waits out a busy lock, then commits", () => {
    const save = saves.create();
    vi.spyOn(saves, "update").mockImplementationOnce(() => {
      throw new SaveError("SAVE_BUSY");
    });
    expect(() => submitPlan(request(save.id), { levers: [] })).not.toThrow();
    expect(saves.read(save.id).played).toHaveLength(1);
  });
});
