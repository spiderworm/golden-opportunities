// Alma in the game (endless.md section 9): when a quarter is committed, Alma prepares the next one in the
// background while the player reads the result; arriving in that quarter only reads the record. The save keeps
// the record, and the first write wins: if the next quarter's loader gives up waiting and writes the scripted
// event, a late Alma answer is dropped, so the player is never simulated on an event other than the one shown.
// Agreed with Frank (#170): one call from game.server.ts's commit(), which never waits on this and never sees
// it throw.

import { loadBookshop } from "~/bookshop/loader.server";
import { saves as gameSaves } from "~/game/session.server";
import { SaveError } from "~/game/store.server";
import type { GameSave, PlayedQuarter } from "~/game/types";
import { trackServer } from "~/platform/analytics/analytics.server";
import type { QuarterContext } from "./candidates";
import { almaModel, chooseEvent, type AlmaModel } from "./director.server";
import { MEASURE_IDS, type MeasureId } from "./events";
import type { QuarterSummary } from "./prompt";
import { quarterAfter } from "./quarters";
import { quarterIndex, type AlmaRecord } from "./record";

/** Alma's first quarter: Q1 and Q2 2194 stay as built (section 9). */
export const FIRST_ALMA_QUARTER = "2194-Q3";
/** A quarter that scored under this is a strike (section 7), and a strike counts for four quarters. */
const STRIKE_BELOW = 70;
const STRIKE_QUARTERS = 4;
/** A measure that fell by more than this, in percent, against the same quarter a year earlier gets a recovery goal. */
const RECOVERY_DROP = 10;

/** What the hook needs, injectable so tests never reach the real model or the real saves. */
export interface AlmaDeps {
  saves: Pick<typeof gameSaves, "read" | "update">;
  model: AlmaModel | null;
  titles: readonly string[];
  track: (name: string, props: Record<string, string | number | boolean>) => void;
}

const defaultDeps = (): AlmaDeps => ({
  saves: gameSaves,
  model: almaModel(),
  titles: [...new Set(loadBookshop().books.map((b) => b.title))],
  track: (name, props) => {
    try {
      trackServer(name, props);
    } catch {
      // A transport failure can't undo a quarter.
    }
  },
});

/** The last quarter played, or null before any. */
const lastPlayed = (save: GameSave) => save.played.at(-1)?.period ?? null;

/** One played quarter as Alma may see it: its plan's fixed choices, its scores, and whether it was a strike. */
export function summarize(quarter: PlayedQuarter): QuarterSummary {
  const plan = quarter.outcome.plan;
  const picks = "picks" in plan ? plan.picks.flatMap((isbn) => (isbn ? [`pick:${isbn}`] : [])) : [];
  const card = quarter.outcome.reportCard.plan;
  return {
    quarter: quarter.period,
    plan: [...plan.levers.map((l) => `lever:${l}`), ...picks],
    scores: Object.fromEntries(card.measures.map((m) => [m.id, m.score])) as Record<MeasureId, number>,
    overall: card.overall.score,
    grade: card.overall.grade,
    strike: card.overall.score < STRIKE_BELOW,
  };
}

/**
 * The context for the quarter after the last one played: Alma's earlier records, the strikes counting now
 * (those of the last four quarters), and a recovery goal for the measure that fell most, if one fell by more
 * than 10% against its same quarter a year earlier (the report card's `lastYear`).
 */
export function contextFor(save: GameSave): QuarterContext | null {
  const last = save.played.at(-1);
  if (!last) return null;
  const quarter = quarterAfter(last.period);
  const strikes = save.played.slice(-STRIKE_QUARTERS).filter((q) => q.outcome.reportCard.plan.overall.score < STRIKE_BELOW).length;
  let recovery: QuarterContext["recovery"];
  for (const m of last.outcome.reportCard.plan.measures) {
    if (!MEASURE_IDS.includes(m.id) || !(m.lastYear > 0)) continue;
    const drop = Math.round(((m.lastYear - m.result) / m.lastYear) * 100);
    if (drop > RECOVERY_DROP && (!recovery || drop > recovery.drop)) recovery = { measure: m.id, drop };
  }
  return { quarter, previous: save.alma ?? [], strikes, ...(recovery ? { recovery } : {}) };
}

type Written = { record: AlmaRecord; kept: boolean } | null;

/**
 * Writes the quarter's record unless one is there already (the first write wins). Retries on a stale revision:
 * the player's own writes bump it. Gives up quietly if the save is gone (a new game) or has moved on.
 */
function write(saveId: string, record: AlmaRecord, deps: AlmaDeps): Written {
  for (let attempt = 0; attempt < 5; attempt++) {
    let save: GameSave;
    try {
      save = deps.saves.read(saveId);
    } catch {
      deps.track("alma_event_dropped", { quarter: record.quarter, reason: "save_gone" });
      return null;
    }
    const existing = save.alma?.find((r) => r.quarter === record.quarter);
    if (existing) return { record: existing, kept: false };
    const last = lastPlayed(save);
    if (!last || quarterAfter(last) !== record.quarter) {
      deps.track("alma_event_dropped", { quarter: record.quarter, reason: "quarter_moved" });
      return null;
    }
    try {
      deps.saves.update(saveId, save.revision, (draft) => {
        draft.alma = [...(draft.alma ?? []), record];
      });
      return { record, kept: true };
    } catch (error) {
      if (error instanceof SaveError && (error.code === "STALE_SAVE" || error.code === "SAVE_BUSY")) continue;
      throw error;
    }
  }
  throw new Error("Alma's record couldn't be written: the save kept changing.");
}

const pending = new Map<string, Promise<AlmaRecord | null>>();
const key = (saveId: string, quarter: string) => `${saveId}:${quarter}`;

function record(saveId: string, context: QuarterContext, history: QuarterSummary[], seed: number, deps: AlmaDeps, model: AlmaModel | null): Promise<AlmaRecord | null> {
  const started = performance.now();
  return chooseEvent(context, history, { seed, model, titles: deps.titles }).then((chosen) => {
    const written = write(saveId, chosen, deps);
    if (!written) return null;
    if (written.kept) {
      deps.track("alma_event_chosen", {
        quarter: chosen.quarter,
        source: chosen.source,
        type: chosen.type,
        ms: Math.round(performance.now() - started),
        attempts: chosen.attempts,
        ...(chosen.failure ? { failure: chosen.failure } : {}),
      });
    } else {
      deps.track("alma_event_dropped", { quarter: chosen.quarter, reason: "already_recorded", source: chosen.source });
    }
    return written.record;
  });
}

/**
 * Called once from commit() after a quarter's transaction succeeds. It starts Alma's turn for the next quarter
 * and returns at once: it never waits, and never throws into the submit.
 */
export function onQuarterCommitted({ saveId, quarter, seed }: { saveId: string; quarter: string; seed: number }, deps: AlmaDeps = defaultDeps()): void {
  try {
    const next = quarterAfter(quarter);
    if (quarterIndex(next) < quarterIndex(FIRST_ALMA_QUARTER)) return;
    const save = deps.saves.read(saveId);
    const context = contextFor(save);
    if (!context || context.quarter !== next || save.alma?.some((r) => r.quarter === next)) return;
    const turn = record(saveId, context, save.played.map(summarize), seed, deps, deps.model)
      .catch(() => {
        deps.track("alma_failed", { quarter: next });
        return null;
      })
      .finally(() => pending.delete(key(saveId, next)));
    pending.set(key(saveId, next), turn);
  } catch {
    deps.track("alma_failed", { quarter: quarterAfter(quarter) });
  }
}

/**
 * The next quarter's record, for its loader: the saved one, or Alma's still on its way within `budgetMs`, or,
 * once the budget is spent or the turn was lost (a restart), the scripted event, written so a reload shows the
 * same one. Null if the save has no quarter for Alma.
 */
export async function almaRecordFor(saveId: string, budgetMs: number, deps: AlmaDeps = defaultDeps()): Promise<AlmaRecord | null> {
  const save = deps.saves.read(saveId);
  const context = contextFor(save);
  if (!context || quarterIndex(context.quarter) < quarterIndex(FIRST_ALMA_QUARTER)) return null;
  const saved = save.alma?.find((r) => r.quarter === context.quarter);
  if (saved) return saved;
  const turn = pending.get(key(saveId, context.quarter));
  if (turn) {
    const timer = new Promise<null>((resolve) => setTimeout(() => resolve(null), budgetMs).unref?.());
    const done = await Promise.race([turn, timer]);
    if (done) return done;
  }
  // The scripted event: the first write wins, so a later Alma answer is dropped, not shown.
  return record(saveId, context, save.played.map(summarize), save.seed, deps, null);
}

/** For tests: forget pending turns. */
export const forgetPending = () => pending.clear();
/** For tests: the pending turn for a save's quarter. */
export const pendingTurn = (saveId: string, quarter: string) => pending.get(key(saveId, quarter));
