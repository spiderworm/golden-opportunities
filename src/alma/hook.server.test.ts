import { afterAll, afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { rmSync } from "node:fs";
const directory = await vi.hoisted(async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  return mkdtempSync(tmpdir() + "/orbital-alma-");
});
vi.mock("../platform/analytics/instance.server", () => ({ DATA_DIR: directory }));
vi.mock("../platform/analytics/analytics.server", () => ({ trackServer: vi.fn() }));
import { getQ2Candidates, submitPlan, submitQ2Plan } from "~/game/game.server";
import { saves } from "~/game/session.server";
import { PLAYABLE_QUARTERS, setPlayableQuarters } from "~/game/quarters";
import { SaveError } from "~/game/store.server";
import type { GameSave, PlayedQuarter } from "~/game/types";
import { trackServer } from "~/platform/analytics/analytics.server";
import type { AlmaModel } from "./director.server";
import {
  almaRecordFor,
  contextFor,
  forgetPending,
  onQuarterCommitted,
  pendingTurn,
  type AlmaDeps,
} from "./hook.server";
import { nextQuarter, type QuarterId } from "~/simulation/quarters";
import { loadBookshop } from "~/bookshop/loader.server";
import { anchorFor, recoveryFor } from "~/simulation/turn";
import { isAlmaRecord, type AlmaRecord } from "./record";

afterEach(() => {
  vi.clearAllMocks();
  forgetPending();
});
afterAll(() => rmSync(directory, { recursive: true, force: true }));

const request = (id: string) =>
  new Request("http://localhost/decide", {
    method: "POST",
    headers: { origin: "http://localhost", cookie: "orbital_save=" + id },
  });

describe("Alma in the game", () => {
  it("spends nothing on a quarter the game can't play yet: no turn for Q3 before it exists (Audit)", async () => {
    // As before the endless loop was switched on: two quarters playable.
    setPlayableQuarters(2);
    onTestFinished(() => setPlayableQuarters(PLAYABLE_QUARTERS));
    const save = saves.create();
    submitPlan(request(save.id), { levers: [] });
    submitQ2Plan(request(save.id), { picks: [getQ2Candidates()[0]!.isbn, null, null], levers: [] });
    expect(pendingTurn(save.id, "2194-Q3")).toBeUndefined();
    expect(await almaRecordFor(save.id, 10)).toBeNull();
    expect(saves.read(save.id).alma).toBeUndefined();
  });

  it("prepares the next quarter once it's playable, and the real save keeps and accepts the record", async () => {
    const save = saves.create();
    submitPlan(request(save.id), { levers: [] });
    expect(pendingTurn(save.id, "2194-Q2")).toBeUndefined(); // Q1 and Q2 stay as built
    const isbn = getQ2Candidates()[0]!.isbn;
    submitQ2Plan(request(save.id), { picks: [isbn, null, null], levers: [] });
    // As if Q3 were built: the real save and the real analytics, with Q3 playable.
    const real: AlmaDeps = {
      saves,
      model: null,
      data: loadBookshop(),
      titles: [],
      track: (name, props) => trackServer(name, props),
      playable: () => true,
    };
    onQuarterCommitted(
      { saveId: save.id, quarter: "2194-Q2", seed: saves.read(save.id).seed },
      real,
    );
    const turn = pendingTurn(save.id, "2194-Q3");
    expect(turn).toBeDefined();
    const record = await turn!;
    expect(record).toMatchObject({ quarter: "2194-Q3", source: "scripted", attempts: 0 }); // no model in a test run
    const stored = saves.read(save.id); // validate() accepts it
    expect(stored.alma).toEqual([record]);
    expect(isAlmaRecord(record)).toBe(true);
    expect(trackServer).toHaveBeenCalledWith(
      "alma_event_chosen",
      expect.objectContaining({ quarter: "2194-Q3", source: "scripted", type: record!.type }),
    );
    // The event names a fixed type and codes only: no text.
    const props = vi
      .mocked(trackServer)
      .mock.calls.find(([name]) => name === "alma_event_chosen")![1]!;
    expect(Object.keys(props).sort()).toEqual(["attempts", "ms", "quarter", "source", "type"]);
    // Arriving in Q3 reads it; a reload gives the same one.
    expect(await almaRecordFor(save.id, 10, real)).toEqual(record);
  });
});

describe("the save's check", () => {
  it("refuses a record before any quarter is played, or past the next one", () => {
    const save = saves.create();
    const record = {
      quarter: "2194-Q3",
      source: "scripted",
      type: "quiet_quarter",
      params: {},
      stretch: { measure: "culture", percent: 12 },
      story: "x",
      reason: "X",
      bossLine: "X",
      promptVersion: 2,
      attempts: 0,
    };
    expect(() =>
      saves.update(save.id, 0, (s) => {
        s.alma = [record as AlmaRecord];
      }),
    ).toThrow("INVALID_SAVE");
  });
});

// A save with played quarters, for the fake store: only what Alma reads of each.
const DATA = loadBookshop();
/** A card with no fall: every measure's result is its anchor, as the report card's lastYear has it. */
const steady = (period: QuarterId) =>
  Object.entries(anchorFor(period, null, DATA).anchor).map(([id, anchor]) => ({
    id,
    result: anchor,
    lastYear: anchor,
    score: 80,
  }));
function played(
  period: QuarterId,
  overall: number,
  measures: { id: string; result: number; lastYear: number; score: number }[] = steady(period),
): PlayedQuarter {
  return {
    period,
    sales: [],
    outcomeId: "x",
    outcome: {
      plan: { levers: ["events"] },
      reportCard: {
        plan: { measures, overall: { score: overall, grade: overall < 70 ? "D" : "B" } },
      },
    },
  } as unknown as PlayedQuarter;
}
function fakeStore(save: GameSave, { staleOnce = false } = {}) {
  let current = structuredClone(save);
  let stale = staleOnce;
  let gone = false;
  return {
    read: vi.fn((id: string) => {
      if (gone || id !== current.id) throw new SaveError("MISSING_SAVE");
      return structuredClone(current);
    }),
    update: vi.fn((id: string, revision: number, change: (s: GameSave) => void) => {
      if (stale || revision !== current.revision) {
        stale = false;
        current.revision += 1; // the player's own write landed first
        throw new SaveError("STALE_SAVE");
      }
      const next = structuredClone(current);
      change(next);
      next.revision += 1;
      current = next;
      return structuredClone(current);
    }),
    get save() {
      return current;
    },
    remove: () => (gone = true),
  };
}
const base = (over: Partial<GameSave> = {}): GameSave => ({
  version: 2,
  id: "s".repeat(43),
  seed: 7,
  revision: 3,
  discoveries: [],
  played: [played("2194-Q1", 80), played("2194-Q2", 75)],
  ...over,
});
const deps = (
  store: ReturnType<typeof fakeStore>,
  model: AlmaModel | null = null,
): AlmaDeps & { events: [string, Record<string, unknown>][] } => {
  const events: [string, Record<string, unknown>][] = [];
  return {
    saves: store,
    model,
    data: DATA,
    titles: [],
    track: (name, props) => events.push([name, props]),
    playable: () => true,
    events,
  };
};
const later = (text: string, ms: number): AlmaModel => ({
  name: "sonnet",
  ask: () => new Promise((resolve) => setTimeout(() => resolve(text), ms)),
});

describe("Alma's turn and the save", () => {
  it("never throws into the submit, and returns at once", () => {
    const d = deps(fakeStore(base()));
    d.saves.read = () => {
      throw new Error("disk on fire");
    };
    expect(() => onQuarterCommitted({ saveId: "x", quarter: "2194-Q2", seed: 1 }, d)).not.toThrow();
    expect(d.events).toEqual([["alma_failed", { quarter: "2194-Q3" }]]);
  });

  it("writes through a stale revision: the player's own writes come first", async () => {
    const store = fakeStore(base(), { staleOnce: true });
    const d = deps(store);
    onQuarterCommitted({ saveId: base().id, quarter: "2194-Q2", seed: 7 }, d);
    await pendingTurn(base().id, "2194-Q3");
    expect(store.save.alma).toHaveLength(1);
    expect(store.update).toHaveBeenCalledTimes(2);
  });

  it("first write wins: a late Alma answer after the loader scripted is dropped, never shown or simulated (Frank)", async () => {
    const store = fakeStore(base());
    const d = deps(
      store,
      later(JSON.stringify({ candidate: 1, story: "Something stirs.", bossLine: "NOTED." }), 60),
    );
    onQuarterCommitted({ saveId: base().id, quarter: "2194-Q2", seed: 7 }, d);
    const arrived = await almaRecordFor(base().id, 10, d);
    expect(arrived).toMatchObject({ source: "scripted", quarter: "2194-Q3" });
    await pendingTurn(base().id, "2194-Q3");
    expect(store.save.alma).toEqual([arrived]);
    expect(
      d.events.some(
        ([name, p]) => name === "alma_event_dropped" && p.reason === "already_recorded",
      ),
    ).toBe(true);
  });

  it("gives up quietly when the save is gone (a new game)", async () => {
    const store = fakeStore(base());
    const d = deps(store, later("{}", 20));
    onQuarterCommitted({ saveId: base().id, quarter: "2194-Q2", seed: 7 }, d);
    store.remove();
    expect(await pendingTurn(base().id, "2194-Q3")).toBeNull();
    expect(d.events).toContainEqual([
      "alma_event_dropped",
      { quarter: "2194-Q3", reason: "save_gone" },
    ]);
  });

  it("does nothing before Q3, and nothing twice", async () => {
    const store = fakeStore(base({ played: [played("2194-Q1", 80)] }));
    onQuarterCommitted({ saveId: base().id, quarter: "2194-Q1", seed: 7 }, deps(store));
    expect(store.read).not.toHaveBeenCalled();
    expect(await almaRecordFor(base().id, 10, deps(store))).toBeNull();
    const done = fakeStore(base());
    await almaRecordFor(base().id, 10, deps(done));
    onQuarterCommitted({ saveId: base().id, quarter: "2194-Q2", seed: 7 }, deps(done));
    expect(pendingTurn(base().id, "2194-Q3")).toBeUndefined();
  });
});

describe("the quarter's context", () => {
  it("counts the strikes that still count next quarter: those of the last three played (section 7, Audit)", () => {
    const quarters: QuarterId[] = ["2194-Q1", "2194-Q2", "2194-Q3", "2194-Q4", "2195-Q1"];
    const save = (scores: number[]) =>
      base({ played: quarters.map((q, i) => played(q, scores[i]!)) });
    expect(contextFor(save([60, 80, 65, 90, 68]), DATA)).toMatchObject({
      quarter: "2195-Q2",
      strikes: 2,
    });
    // A strike at N-3 (2194-Q2) counted through 2195-Q1, its fourth quarter, and no longer counts in 2195-Q2.
    expect(contextFor(save([90, 60, 80, 90, 90]), DATA)).toMatchObject({ strikes: 0 });
    expect(contextFor(save([90, 90, 60, 90, 90]), DATA)).toMatchObject({ strikes: 1 });
  });

  it("takes its recovery goal from the engine's recoveryFor: the plan's own fall, not the anchor (Frank, Sim)", () => {
    expect(contextFor(base(), DATA)).not.toHaveProperty("recovery"); // no fall
    const fell = steady("2194-Q2").map((m) =>
      m.id === "readers" ? { ...m, result: m.lastYear * 0.75 } : m,
    );
    const save = base({ played: [played("2194-Q1", 80), played("2194-Q2", 60, fell)] });
    const recovery = contextFor(save, DATA)!.recovery;
    expect(recovery?.measure).toBe("readers");
    expect(recovery!.drop).toBeGreaterThan(10);
    expect(recovery).toEqual(
      recoveryFor(
        save.played.map((q) => ({ quarter: q.period, card: q.outcome.reportCard.plan })),
        DATA,
      ),
    );
  });

  it("names quarters past the built ones", () => {
    expect(nextQuarter("2194-Q2")).toBe("2194-Q3");
    expect(nextQuarter("2194-Q4")).toBe("2195-Q1");
  });
});
