import { afterAll, describe, expect, it, vi } from "vitest";
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
const directory = await vi.hoisted(async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  return mkdtempSync(tmpdir() + "/replay-");
});
vi.mock("../platform/analytics/instance.server", () => ({
  DATA_DIR: directory,
  instanceId: () => "0123abcd-0000-4000-8000-000000000000",
}));
vi.mock("../platform/analytics/analytics.server", () => ({ trackServer: vi.fn() }));
import { loadBookshop } from "../bookshop/loader.server";
import { trackServer } from "../platform/analytics/analytics.server";
import { runQuery } from "../query/run-query.server";
import { getOutcome, getQ2Candidates, resetGame, submitPlan, submitQ2Plan } from "./game.server";
import { forgetReplays, linesHash, quarterCells, replayLines } from "./replay.server";
import { getGameSession, queryViewForSave, saves } from "./session.server";
import { SaveError } from "./store.server";
import type { PlayedQuarter } from "./types";

afterAll(() => rmSync(directory, { recursive: true, force: true }));
const request = (id: string, url = "http://localhost/decide") =>
  new Request(url, {
    method: "POST",
    headers: { origin: "http://localhost", cookie: "orbital_save=" + id },
  });
const revenue = (id: string, quarter: string) =>
  runQuery(
    { measure: "revenue", by: [], filter: { quarter: [quarter] } },
    getGameSession(request(id)).queryView,
  ).total;
function played() {
  const save = saves.create();
  const req = request(save.id);
  submitPlan(req, { levers: ["repick", "events"] });
  submitQ2Plan(req, { picks: [getQ2Candidates()[0]!.isbn, null, null], levers: ["events"] });
  return save.id;
}

describe("a played quarter's lines (endless.md section 9, how quarters are kept)", () => {
  it("are kept as a hash and a count, not the lines, so a save stays small", () => {
    const id = played();
    const save = saves.read(id);
    for (const quarter of save.played) {
      expect(quarter).not.toHaveProperty("sales");
      expect(quarter.lines).toEqual({
        hash: expect.stringMatching(/^[0-9a-f]{64}$/),
        count: quarter.outcome.totals.plan.units,
      });
    }
    // Two quarters' lines were about 4 MB as stored; now the whole save is a few tens of KB.
    expect(readFileSync(path.join(directory, "saves", id + ".json")).length).toBeLessThan(200_000);
  });

  it("are replayed from the plan and the seed, and give the same ledger as when they were played", () => {
    const id = played();
    const before = ["2194-Q1", "2194-Q2"].map((q) => revenue(id, q));
    forgetReplays();
    const after = ["2194-Q1", "2194-Q2"].map((q) => revenue(id, q));
    expect(after).toEqual(before);
    expect(after[0]).toBeCloseTo(getOutcome(request(id))!.totals.plan.revenue, 6);
    expect(after[1]).toBeCloseTo(getOutcome(request(id), "2194-Q2")!.totals.plan.revenue, 6);
    const save = saves.read(id);
    for (const quarter of save.played)
      expect(linesHash(replayLines(quarter, save.seed, loadBookshop()))).toBe(quarter.lines!.hash);
  });

  it("refuse loudly when a replay no longer matches (an engine change), and a reset recovers", () => {
    const id = played();
    const save = saves.read(id);
    saves.update(id, save.revision, (draft) => {
      draft.played[1] = {
        ...draft.played[1]!,
        lines: { ...draft.played[1]!.lines!, hash: "0".repeat(64) },
      } as PlayedQuarter;
    });
    forgetReplays();
    expect(() => queryViewForSave(saves.read(id))).toThrow(
      expect.objectContaining({ code: "REPLAY_MISMATCH", quarter: "2194-Q2" }),
    );
    expect(vi.mocked(trackServer)).toHaveBeenCalledWith("save_replay_refused", {
      quarter: "2194-Q2",
      engine: 1,
    });
    // Never silently rescored: the count is checked too.
    const counted = {
      ...saves.read(id).played[0]!,
      lines: { ...saves.read(id).played[0]!.lines!, count: 1 },
    } as PlayedQuarter;
    expect(() => quarterCells(id, save.seed, counted, loadBookshop)).toThrow(SaveError);
    const fresh = resetGame(request(id, "http://localhost/settings/reset"));
    expect(fresh).toMatch(/orbital_save_[0-9a-f]{8}=/);
  });

  it("read an older save's stored lines as they are, without replaying", () => {
    const id = played();
    const save = saves.read(id);
    const stored = replayLines(save.played[0]!, save.seed, loadBookshop());
    // An older save, as written before: the lines themselves, no hash.
    saves.update(id, save.revision, (draft) => {
      const { lines: _, ...rest } = draft.played[0]!;
      draft.played[0] = { ...rest, sales: stored } as PlayedQuarter;
    });
    const older = saves.read(id);
    expect(older.played[0]).toHaveProperty("sales");
    // Its stored lines are what's rolled up: it has no hash, so a replay couldn't be checked, and would refuse.
    expect(quarterCells(id, older.seed, older.played[0]!, loadBookshop).lines).toBe(
      older.played[0]!.sales!.length,
    );
    expect(revenue(id, "2194-Q1")).toBeCloseTo(getOutcome(request(id))!.totals.plan.revenue, 6);
  });

  it("refuses a quarter with both forms, or a malformed hash", () => {
    const id = played();
    const save = saves.read(id);
    const both = (draft: typeof save) => {
      draft.played[0] = { ...draft.played[0]!, sales: [] } as never;
    };
    expect(() => saves.update(id, save.revision, both)).toThrow(
      expect.objectContaining({ code: "INVALID_SAVE" }),
    );
    const badHash = (draft: typeof save) => {
      draft.played[0] = {
        ...draft.played[0]!,
        lines: { hash: "nope", count: draft.played[0]!.lines!.count },
      } as PlayedQuarter;
    };
    expect(() => saves.update(id, saves.read(id).revision, badHash)).toThrow(
      expect.objectContaining({ code: "INVALID_SAVE" }),
    );
  });
});

describe("a save whose replay no longer matches", () => {
  it("still opens the shell (date, alerts, standing order) and Settings, so Reset game can be reached (Plot, #198)", async () => {
    const { getStationState } = await import("../shell/station-state");
    const id = played();
    const save = saves.read(id);
    saves.update(id, save.revision, (draft) => {
      draft.played[0] = {
        ...draft.played[0]!,
        lines: { ...draft.played[0]!.lines!, hash: "f".repeat(64) },
      } as PlayedQuarter;
    });
    forgetReplays();
    const req = request(id, "http://localhost/settings");
    expect(getStationState(req)).toMatchObject({
      date: "2194-07-01",
      standingOrder: { quarter: "2194-Q3" },
    });
    // Only what needs the lines refuses, and only when it reads them.
    const session = getGameSession(req);
    expect(session.save.id).toBe(id);
    // For a page's loader it's a 409 naming the first quarter that no longer replays, for the shell's error screen.
    let thrown: unknown;
    try {
      void session.queryView;
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({ data: { replayMismatch: "2194-Q1" }, init: { status: 409 } });
  });
});

describe("the query endpoint, on a save that no longer replays", () => {
  it("says so, with its own code, rather than an internal error (Audit, #198)", async () => {
    const { createQueryHandler } = await import("../query/http.server");
    const id = played();
    const save = saves.read(id);
    saves.update(id, save.revision, (draft) => {
      draft.played[1] = {
        ...draft.played[1]!,
        lines: { ...draft.played[1]!.lines!, hash: "e".repeat(64) },
      } as PlayedQuarter;
    });
    forgetReplays();
    const response = await createQueryHandler({ track: () => {} })(
      new Request("http://localhost:3000/api/query", {
        method: "POST",
        headers: {
          cookie: "orbital_save=" + id,
          origin: "http://localhost:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({ measure: "units", by: [] }),
      }),
    );
    expect(response.status).toBe(409);
    expect((await response.json()).error).toEqual({
      code: "SAVE_NOT_REPLAYABLE",
      message:
        "This game was saved by an earlier version, and can't be replayed. Start over from Settings.",
    });
  });
});

describe("the replay cache (Audit, #233)", () => {
  it("keeps a long save whole, and lets the least recently used other save go once over its bound", async () => {
    const { joinSales, rememberLines, replayCacheSize, setReplayCacheLimit } =
      await import("./replay.server");
    const { rollUpSales } = await import("../query/sale-cells");
    const data = loadBookshop();
    // Twenty real lines a quarter, and the bound in cells: room for 50 of these quarters.
    const lines = data.saleLines.slice(0, 20);
    const k = rollUpSales(joinSales(lines, data)).cells.length;
    forgetReplays();
    setReplayCacheLimit(50 * k);
    try {
      const quarter = (n: number) =>
        ({
          period: "2194-Q3",
          outcomeId: `q${n}`,
          lines: { hash: "a".repeat(64), count: 20 },
        }) as unknown as PlayedQuarter;
      // Another save first, then a long one: 60 quarters, past the bound alone.
      rememberLines("other", quarter(0), lines, data);
      for (let n = 0; n < 60; n++) rememberLines("long", quarter(n), lines, data);
      // The long save keeps all 60 quarters (it's the one in use); the other save went to make room.
      expect(replayCacheSize()).toEqual({ saves: 1, cells: 60 * k });
      // Within the bound, saves share it, least recently used out first.
      forgetReplays();
      for (const id of ["a", "b", "c"])
        for (let n = 0; n < 10; n++) rememberLines(id, quarter(n), lines, data);
      expect(replayCacheSize()).toEqual({ saves: 3, cells: 30 * k });
      // A fourth save pushes the total past the bound: the oldest, a, goes, and that's enough.
      for (let n = 0; n < 30; n++) rememberLines("d", quarter(n), lines, data);
      expect(replayCacheSize()).toEqual({ saves: 3, cells: 50 * k });
    } finally {
      setReplayCacheLimit(600_000);
      forgetReplays();
    }
  });
});
