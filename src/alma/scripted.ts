// The scripted fallback (endless.md section 9): when the model is unavailable, too slow, or wrong twice, the
// quarter takes the first of its three candidates with scripted flavor. The candidates come from the save's
// seed and the quarter, so a retry after a failed write scripts the same event. The flavor passes the same
// checks as Alma's (tested for every type and measure).
//
// The texts are stand-ins until Plot writes them: one per type and value, and a reason per measure.

import type { Candidate, QuarterContext } from "./candidates";
import type { MeasureId } from "./events";
import { wantsReason, type Flavor } from "./validate";

const STORIES: Record<string, string> = {
  genre_surge: "A book club on the hydroponics deck has picked its next reading list.",
  genre_slump: "The station archive is lending part of its collection free of charge.",
  quiet_days: "The Ring C shuttle has moved its docking time.",
  author_fares: "The shuttle line has repriced its author fares.",
  format_costs: "The printworks reports a shortage of binding materials.",
  quiet_quarter: "The station expects an ordinary season on the ring.",
};

const REASONS: Record<MeasureId, string> = {
  profit: "THE TREASURY HAS ASKED FOR A HEALTHIER LEDGER.",
  readers: "THE COUNCIL HAS READ A STUDY ABOUT FOOT TRAFFIC.",
  happiness: "THE WELFARE BOARD HAS RECEIVED LETTERS.",
  culture: "THE ARTS PANEL IS PREPARING ITS ANNUAL REVIEW.",
};

const BOSS_LINES: Record<string, string> = {
  genre_surge: "THE COMMERCE OFFICE HAS NOTED THE BOOK CLUB. DO NOT WASTE IT.",
  genre_slump: "THE ARCHIVE IS NOT OUR CONCERN. YOUR LEDGER IS.",
  quiet_days: "THE SHUTTLE TIMETABLE IS FINAL. ADAPT.",
  author_fares: "THE FARES ARE THE FARES. PLAN ACCORDINGLY.",
  format_costs: "THE PRINTWORKS SENDS ITS REGRETS. WE DO NOT ACCEPT THEM.",
  quiet_quarter: "A QUIET QUARTER IS NO EXCUSE. WE ARE WATCHING.",
};

/** The scripted flavor for a candidate. */
export function scriptedFlavor(candidate: Candidate, context: QuarterContext): Flavor {
  return {
    story: STORIES[candidate.type],
    ...(wantsReason(candidate, context) && candidate.stretch ? { reason: REASONS[candidate.stretch.measure] } : {}),
    bossLine: BOSS_LINES[candidate.type],
  };
}
