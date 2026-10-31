// The decision screen's words, exactly as Plot wrote them
// (docs/design/m1-copy.md, section 3). Change them there first.
import type { LeverId } from "~/simulation/types";

export const DECIDE_COPY = {
  heading: "PLAN FOR Q1 2194",
  intro: [
    "Your bosses grade the quarter on four measures: Profit, Readers served, Happiness and Culture. Each goal is last year's first quarter plus 5%.",
    "Your score is your lowest measure. Raise one measure by sinking another, and your score sinks with it.",
  ],
  rulesHeading: "What you need to know",
  rules: [
    "Profit is revenue minus what the books cost you.",
    "Books cost the store 60% of their list price.",
    "An author night costs $200: the author's shuttle fare and the room.",
    "Your plan runs from January 1 to March 31.",
    "Choose up to two moves, or none to hold course.",
  ],
  scheduledHeading: "Already scheduled by the previous manager",
  scheduledIntro: "Book of the Month, 15% off for the whole month:",
  scheduled: [
    { month: "January", title: "The Mallemaroking", format: "mass market paperback" },
    { month: "February", title: "Rystwyth", format: "hardcover" },
    { month: "March", title: "Portmeirion", format: "mass market paperback" },
  ],
  movesHeading: "Your moves (choose up to two)",
  holdCourse: "Hold course: the schedule runs as it is.",
  tooMany: "You can choose up to two moves.",
  submit: "Submit plan",
  /** Chart's proposal, pending Plot: the plan didn't go in (a busy save, storage trouble). */
  notSubmitted: "Your plan didn't go through. Please submit it again.",
  confirm: "Submit this plan? It runs for the whole quarter and can't be changed.",
  confirmSubmit: "Submit",
  keepInvestigating: "Keep investigating",
  playing: ["January...", "February...", "March..."],
  closed: "The quarter is closed.",
} as const;

/** The moves, in LEVER_IDS order. */
export const MOVES: { id: LeverId; title: string; line: string }[] = [
  {
    id: "repick",
    title: "Re-pick Book of the Month",
    line: "Feature Kalakalal Avenue (January), Can I Be Honest? (February) and Who Did You Think You Were Kidding? (March), all in hardcover, instead of the scheduled picks.",
  },
  { id: "events", title: "Weekday author nights", line: "Host 12 author nights, one each week on a Tuesday, Wednesday or Thursday, at $200 each." },
  { id: "sale", title: "Station-wide sale", line: "15% off every book, all quarter. The Book of the Month runs at the same 15%." },
];
