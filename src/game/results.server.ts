// What the result screen shows for a played quarter (docs/design/q2.md section 7). Server-only:
// the result loader passes this on, and maps the discovery ids to their words.
import { runQuery } from "../query/run-query.server";
import { gradeFor, roundHalfUp } from "../simulation/grading";
import type { Grade, MeasureId, MeasureScore, Outcome } from "../simulation/types";
import { getGameSession } from "./session.server";
import { currentQuarter, isFinished, removedQuarter } from "./progress";
import { quarterAt, quarterIndex, quarterNumber, type QuarterId } from "./quarters";
import { STRIKE_BELOW, strikes } from "../simulation/strikes";
import {
  LATER_DISCOVERIES,
  laterContext,
  laterOffers,
  type LaterDiscoveryId,
} from "./later-discoveries";
import type { DiscoveryId, GameSave, PlayedQuarter, Q2GameOutcome } from "./types";

export interface HalfYearQuarter {
  quarter: "2194-Q1" | "2194-Q2";
  measures: MeasureScore[];
  overall: { score: number; grade: Grade };
}
/** Set once both quarters are played. The score is the mean of the two overall scores, rounded half up (q2.md section 7). */
export interface HalfYear {
  quarters: HalfYearQuarter[];
  score: number;
  grade: Grade;
}
interface Common {
  /** The quarter's discoveries, as ids: A to C for Q1, D to F for Q2. Map them to their words with earnedDiscoveries. */
  discoveries: DiscoveryId[];
  /** From Q3, the quarter's discoveries found ("event", "record", "weakest"); empty before. */
  laterDiscoveries: LaterDiscoveryId[];
  /** From Q3, what the quarter offered, with what each text names (endless-copy.md section 4); empty before. */
  discoveryOffers: { id: LaterDiscoveryId; params: Record<string, string> }[];
  /** Revenue in the same quarter a year earlier: 2193's in 2194, then the player's own. */
  sameQuarterLastYear: number;
  /** That quarter's name ("Q3 2193", "Q3 2194"). */
  lastYearLabel: string;
  /** Revenue in the quarter before: Q4 2193 for Q1, then the player's own. */
  previousQuarter: number;
  /** That quarter's name ("Q4 2193", "Q2 2194"). */
  referenceLabel: string;
  /** The quarter before, by month, for the chart's faint reference line. */
  reference: { month: string; revenue: number }[];
  /** The quarter to play next ("Continue to Q2" links to "/"), or null. */
  next: QuarterId | null;
  /** True once the game is over: today after Q2; in the endless game, once the panel has removed the player. */
  canPlayAgain: boolean;
  halfYear: HalfYear | null;
  /**
   * The quarter's stretched goal, for the goals note: its measure, percent (a fraction) and, for a recovery goal,
   * the quarter it fell in. Null in Q1 and Q2, and with two strikes counting. The same numbers as Decide's brief.
   */
  goalStretch: { measure: MeasureId; percent: number; recoveryFrom: QuarterId | null } | null;
  /** The season note: revenue in 2193's same quarter, and in the 2193 quarter before it (Q4 2193 for a Q1). */
  season2193: { quarter: number; before: number; beforeLabel: string };
  /** Every quarter played, oldest first: the service record (endless.md section 6). */
  record: ServiceRow[];
  /** Set once the panel has removed the player (endless.md section 7): the quarter it happened in, and its strikes. */
  removed: { at: QuarterId; strikes: { quarter: QuarterId; score: number }[] } | null;
}
/** Q1 2194 with M1's outcome; every later quarter with Q2's shape (endless.md). */
export type ResultData = Common &
  ({ quarter: "2194-Q1"; outcome: Outcome } | { quarter: QuarterId; outcome: Q2GameOutcome });

/**
 * One row of the service record: a played quarter's measures and overall, whether it was a strike, and its Alma
 * event's type and params, for the short title (endless-copy.md section 1); null in Q1 and Q2, which have none.
 */
export interface ServiceRow {
  quarter: QuarterId;
  measures: MeasureScore[];
  overall: { score: number; grade: Grade };
  strike: boolean;
  event: { type: string; params: Readonly<Record<string, string | number>> } | null;
}

/** The quarter before, as the ledger names it: 2193-Q4 before Q1 2194. */
const before = (quarter: QuarterId) =>
  quarterIndex(quarter) === 0 ? "2193-Q4" : quarterAt(quarterIndex(quarter) - 1);
/** The same quarter a year earlier: 2193's in 2194, then the player's own. */
const yearEarlier = (quarter: QuarterId) => `${Number(quarter.slice(0, 4)) - 1}${quarter.slice(4)}`;
/** "2194-Q3" as "Q3 2194". */
export const quarterLabel = (quarter: string) => `${quarter.slice(5)} ${quarter.slice(0, 4)}`;

const eventRow = (save: GameSave, quarter: QuarterId): ServiceRow["event"] => {
  const record = save.alma?.find((r) => r.quarter === quarter);
  return record ? { type: record.type, params: { ...record.params } } : null;
};
/** A played quarter's stretched goal, from its Alma record, as Decide's brief has it (game.server.ts briefOf). */
export function goalStretchOf(save: GameSave, quarter: QuarterId): Common["goalStretch"] {
  const record = save.alma?.find((r) => r.quarter === quarter);
  const s = record?.stretch;
  if (!record || !s) return null;
  const index = quarterIndex(quarter);
  return {
    measure: s.measure,
    percent: (record.drop !== undefined ? Math.min(record.drop, s.percent) : s.percent) / 100,
    recoveryFrom: record.drop !== undefined && index > 0 ? quarterAt(index - 1) : null,
  };
}
export function serviceRecord(save: GameSave): ServiceRow[] {
  return save.played.map(({ period, outcome }) => ({
    quarter: period,
    measures: outcome.reportCard.plan.measures,
    overall: {
      score: outcome.reportCard.plan.overall.score,
      grade: outcome.reportCard.plan.overall.grade,
    },
    strike: outcome.reportCard.plan.overall.score < STRIKE_BELOW,
    event: eventRow(save, period),
  }));
}
export function removalOf(save: GameSave): Common["removed"] {
  const at = removedQuarter(save);
  if (at === null) return null;
  const window = save.played.slice(Math.max(0, at - 3), at + 1);
  if (
    strikes(
      window.map((q) => q.outcome.reportCard.plan.overall.score),
      "removal",
    ) < 3
  )
    return null;
  return {
    at: save.played[at]!.period,
    strikes: window
      .filter((q) => q.outcome.reportCard.plan.overall.score < STRIKE_BELOW)
      .map((q) => ({ quarter: q.period, score: q.outcome.reportCard.plan.overall.score })),
  };
}

/** Q1 2194, played with M1's engine: TypeScript can't narrow a quarter name to it by comparison alone. */
export const isFirst = (q: PlayedQuarter): q is Extract<PlayedQuarter, { period: "2194-Q1" }> =>
  q.period === "2194-Q1";

export function halfYearOf(save: GameSave): HalfYear | null {
  // Only a game that ended after Q2, as the game did before the endless loop: from Q3 the service record replaces it.
  if (!isFinished(save) || save.played.length !== 2) return null;
  const quarters = save.played.map(({ period, outcome }) => ({
    quarter: period as HalfYearQuarter["quarter"],
    measures: outcome.reportCard.plan.measures,
    overall: {
      score: outcome.reportCard.plan.overall.score,
      grade: outcome.reportCard.plan.overall.grade,
    },
  }));
  const score = roundHalfUp(
    quarters.reduce((sum, q) => sum + q.overall.score, 0) / quarters.length,
  );
  return { quarters, score, grade: gradeFor(score) };
}

/** The latest played quarter's result, or the given one's; null when that quarter isn't played (the loader redirects to /decide). */
export function getResultData(request: Request, period?: QuarterId): ResultData | null {
  const { save, queryView } = getGameSession(request);
  const played = period ? save.played.find((q) => q.period === period) : save.played.at(-1);
  if (!played) return null;
  const revenue = (quarter: string) =>
    runQuery({ measure: "revenue", by: [], filter: { quarter: [quarter] } }, queryView).rows[0]
      ?.revenue ?? 0;
  const previous = before(played.period);
  const seasonBefore =
    quarterNumber(played.period) === 1 ? "2193-Q4" : `2193-Q${quarterNumber(played.period) - 1}`;
  const lastYear = yearEarlier(played.period);
  const reference = runQuery(
    { measure: "revenue", by: ["month"], filter: { quarter: [previous] } },
    queryView,
  ).rows.map((r) => ({ month: r.month ?? "", revenue: r.revenue ?? 0 }));
  const common: Common = {
    discoveries: played.outcome.discoveries.filter(
      (d): d is DiscoveryId => !(LATER_DISCOVERIES as readonly string[]).includes(d),
    ),
    laterDiscoveries: played.outcome.discoveries.filter((d): d is LaterDiscoveryId =>
      (LATER_DISCOVERIES as readonly string[]).includes(d),
    ),
    sameQuarterLastYear: revenue(lastYear),
    lastYearLabel: quarterLabel(lastYear),
    previousQuarter: revenue(previous),
    referenceLabel: quarterLabel(previous),
    reference,
    next: currentQuarter(save),
    canPlayAgain: isFinished(save),
    halfYear: halfYearOf(save),
    discoveryOffers: (() => {
      const ctx = laterContext(save, played.period);
      return ctx ? laterOffers(ctx) : [];
    })(),
    goalStretch: goalStretchOf(save, played.period),
    season2193: {
      quarter: revenue(`2193-Q${quarterNumber(played.period)}`),
      before: revenue(seasonBefore),
      beforeLabel: quarterLabel(seasonBefore),
    },
    record: serviceRecord(save),
    removed: removalOf(save),
  };
  return isFirst(played)
    ? { ...common, quarter: played.period, outcome: played.outcome }
    : { ...common, quarter: played.period, outcome: played.outcome as Q2GameOutcome };
}
