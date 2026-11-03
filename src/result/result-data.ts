// What the result screen shows, for either quarter: the game's ResultData (src/game/results.server.ts), with
// its discoveries put into words, server-side, for this player only.
import type { ResultData as GameResultData } from "~/game/results.server";
import type { EarnedDiscovery } from "./discoveries.server";

export type ResultData = Omit<GameResultData, "discoveries"> & { discoveries: EarnedDiscovery[] };
export type HalfYearData = NonNullable<ResultData["halfYear"]>;

/** Whether the plan was to hold course: no moves, and in Q2 no picks either. */
export function heldCourse(outcome: ResultData["outcome"]): boolean {
  return (
    outcome.plan.levers.length === 0 &&
    !("picks" in outcome.plan && outcome.plan.picks.some(Boolean))
  );
}

/** A fixed vocabulary for analytics: "repick+events", "picks2+events", or "hold". */
export function planSummary(outcome: ResultData["outcome"]): string {
  const picks = "picks" in outcome.plan ? outcome.plan.picks.filter(Boolean).length : 0;
  return [...(picks ? [`picks${picks}`] : []), ...outcome.plan.levers].join("+") || "hold";
}
