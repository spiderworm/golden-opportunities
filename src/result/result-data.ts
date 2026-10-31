// What the result loader gives the screen, for either quarter: Frank's shape (q2-game-state), so the screen
// is the same whichever loader fills it.
import type { Grade, MeasureScore, Outcome, Q2Outcome } from "~/simulation/types";
import type { ResultQuarter } from "./copy";
import type { DiscoveryId, EarnedDiscovery } from "./discoveries.server";

export interface HalfYearData {
  /** Q1 2194, then Q2 2194. */
  quarters: { quarter: ResultQuarter; measures: MeasureScore[]; overall: { score: number; grade: Grade } }[];
  /** The mean of the two overall scores, rounded half up: the game's, never worked out here. */
  score: number;
  grade: Grade;
}

export interface ResultData {
  quarter: ResultQuarter;
  outcome: Outcome | (Q2Outcome & { discoveries: DiscoveryId[] });
  discoveries: EarnedDiscovery[];
  /** 2193's revenue for the same quarter. */
  sameQuarterLastYear: number;
  /** Revenue of the quarter before: Q4 2193 for Q1, the player's Q1 2194 for Q2. */
  previousQuarter: number;
  /** The quarter before, by month, drawn faintly behind. */
  reference: { month: string; revenue: number }[];
  /** The quarter still to play, if any: "Continue to Q2" goes to the station for it. */
  next: "2194-Q2" | null;
  /** Whether "Play again" may start a new game (both quarters played). */
  canPlayAgain: boolean;
  /** Set once both quarters are played. */
  halfYear: HalfYearData | null;
}

/** Whether the plan was to hold course: no moves, and in Q2 no picks either. */
export function heldCourse(outcome: ResultData["outcome"]): boolean {
  return outcome.plan.levers.length === 0 && !("picks" in outcome.plan && outcome.plan.picks.some(Boolean));
}

/** A fixed vocabulary for analytics: "repick+events", "picks2+events", or "hold". */
export function planSummary(outcome: ResultData["outcome"]): string {
  const picks = "picks" in outcome.plan ? outcome.plan.picks.filter(Boolean).length : 0;
  return [...(picks ? [`picks${picks}`] : []), ...outcome.plan.levers].join("+") || "hold";
}
