// Alma writes the station's backstory when a game starts, new or reset (docs/design/backstory.md, section 8).
// It runs in the background, so the arrival never waits: until a record is saved, the game uses its seeded
// fallback, which leans on the same take. The first write wins, and a reload never asks Alma again.

import { AssistantUnavailable } from "~/assistant/server/provider.server";
import { loadBookshop } from "~/bookshop/loader.server";
import { SaveError } from "~/game/store.server";
import type { GameSave } from "~/game/types";
import { trackServer } from "~/platform/analytics/analytics.server";
import { BACKSTORY_FAILURES, type BackstoryRecord } from "./backstory-record";
import { BACKSTORY_PROMPT_VERSION, BACKSTORY_RULES, backstoryInput, backstoryProblem, parseBackstory, pickBackstory, scriptedBackstory } from "./backstory";
import { ALMA_TIMEOUT_MS, almaModel, type AlmaModel } from "./director.server";

/** What the backstory needs, injectable so tests never reach the real model; the saves come from the caller. */
export interface BackstoryDeps {
  saves: { read(id: string): GameSave; update(id: string, revision: number, change: (save: GameSave) => void): GameSave };
  model: AlmaModel | null;
  track: (name: string, props: Record<string, string | number | boolean>) => void;
  timeoutMs?: number;
}

/** The catalog's titles, authors and publishers: none may be named in the backstory. */
let catalog: string[] | undefined;
export function catalogNames(): string[] {
  if (catalog) return catalog;
  const data = loadBookshop();
  const names = new Set<string>();
  for (const b of data.books) names.add(b.title);
  for (const a of data.authors) names.add(`${a.firstName} ${a.lastName}`.trim());
  for (const p of data.publishers) names.add(p.name);
  return (catalog = [...names].filter((n) => /\p{L}{3}/u.test(n)));
}

const failureOf = (error: unknown) => {
  const code = error instanceof AssistantUnavailable ? `unavailable:${error.kind}` : "unavailable:other";
  return BACKSTORY_FAILURES.includes(code) ? code : "unavailable:other";
};

/** Alma's backstory for a seed: its words if they pass, after one retry on an invalid answer, else the scripted one. */
export async function writeBackstory(seed: number, model: AlmaModel | null, names: readonly string[], timeoutMs = ALMA_TIMEOUT_MS): Promise<BackstoryRecord> {
  if (!model) return scriptedBackstory(seed);
  const { take, details } = pickBackstory(seed);
  const input = backstoryInput(seed);
  let failure = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let raw: string;
    try {
      raw = await model.ask(BACKSTORY_RULES, attempt === 1 ? input : `${input}\n\nYour last answer was rejected (${failure}). Answer again, keeping every rule.`, controller.signal);
    } catch (error) {
      return scriptedBackstory(seed, { attempts: attempt, failure: controller.signal.aborted ? "timeout" : failureOf(error) });
    } finally {
      clearTimeout(timer);
    }
    if (controller.signal.aborted) return scriptedBackstory(seed, { attempts: attempt, failure: "timeout" });
    const parsed = parseBackstory(raw);
    const problem = parsed.ok ? backstoryProblem(parsed.text as unknown as Record<string, unknown>, names) : parsed.failure;
    if (parsed.ok && !problem) return { source: "alma", take, details, ...parsed.text, model: model.name, promptVersion: BACKSTORY_PROMPT_VERSION, attempts: attempt };
    failure = problem!;
  }
  return scriptedBackstory(seed, { attempts: 2, failure });
}

/** Saves the backstory unless the game has one (the first write wins), retrying on a stale revision; quiet if the save is gone. */
function save(saveId: string, record: BackstoryRecord, deps: BackstoryDeps): boolean {
  for (let attempt = 0; attempt < 5; attempt++) {
    let current: GameSave;
    try {
      current = deps.saves.read(saveId);
    } catch {
      return false;
    }
    if (current.backstory) return false;
    try {
      deps.saves.update(saveId, current.revision, (draft) => {
        draft.backstory = record;
      });
      return true;
    } catch (error) {
      if (error instanceof SaveError && (error.code === "STALE_SAVE" || error.code === "SAVE_BUSY")) continue;
      throw error;
    }
  }
  return false;
}

const pending = new Map<string, Promise<BackstoryRecord | null>>();

/**
 * Called once a game's save is created (startGame: a first visit, Play again or Reset game). It starts Alma's
 * backstory in the background and returns at once: it never waits, and never throws into the caller.
 */
export function onGameStarted({ saveId, seed }: { saveId: string; seed: number }, deps: Partial<BackstoryDeps> & Pick<BackstoryDeps, "saves">): void {
  const track = deps.track ?? ((name, props) => {
    try {
      trackServer(name, props);
    } catch {
      // A transport failure can't undo a game.
    }
  });
  try {
    const model = deps.model === undefined ? almaModel() : deps.model;
    const started = performance.now();
    const turn = writeBackstory(seed, model, catalogNames(), deps.timeoutMs)
      .then((record) => {
        if (!save(saveId, record, { ...deps, model, track })) return null;
        track("backstory_written", { source: record.source, take: record.take, attempts: record.attempts, durationMs: Math.round(performance.now() - started), ...(record.failure ? { failure: record.failure } : {}) });
        return record;
      })
      .catch(() => {
        track("backstory_failed", {});
        return null;
      })
      .finally(() => pending.delete(saveId));
    pending.set(saveId, turn);
  } catch {
    track("backstory_failed", {});
  }
}

/** For tests: the pending backstory for a save. */
export const pendingBackstory = (saveId: string) => pending.get(saveId);
