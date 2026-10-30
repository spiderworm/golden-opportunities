// The decision screen's words, exactly as Plot wrote them
// (docs/design/m1-copy.md, section 3). Change them there first.
import type { OptionId } from "~/game-stub/types";

export const DECIDE_COPY = {
  heading: "PLAN FOR Q1 2194",
  goal: "The Commerce Office will judge your plan on one figure: the store's gross profit for the quarter.",
  rulesHeading: "What you need to know",
  rules: [
    "Gross profit is revenue minus what the books cost you.",
    "Books cost the store 60% of their list price.",
    "An author night costs $200: the author's shuttle fare and the room.",
    "Your plan runs from January 1 to March 31. Choose one option.",
  ],
  scheduledHeading: "Already scheduled by the previous manager",
  scheduledIntro: "Book of the Month, 15% off for the whole month:",
  scheduled: [
    { month: "January", title: "The Mallemaroking", format: "mass market paperback" },
    { month: "February", title: "Rystwyth", format: "hardcover" },
    { month: "March", title: "Portmeirion", format: "mass market paperback" },
  ],
  submit: "Submit plan",
  confirm: "Submit this plan? It runs for the whole quarter and can't be changed.",
  confirmSubmit: "Submit",
  keepInvestigating: "Keep investigating",
  playing: ["January...", "February...", "March..."],
  closed: "The quarter is closed.",
} as const;

export const OPTIONS: { id: OptionId; title: string; line: string }[] = [
  { id: "A", title: "A. Hold course", line: "Keep the schedule as it is." },
  { id: "B", title: "B. Station-wide sale", line: "15% off every book, all quarter. The Book of the Month runs at the same 15%." },
  {
    id: "C",
    title: "C. Re-pick Book of the Month",
    line: "Feature Kalakalal Avenue (January), Can I Be Honest? (February) and Who Did You Think You Were Kidding? (March), all in hardcover.",
  },
  {
    id: "D",
    title: "D. Weekday author nights",
    line: "Host 12 author nights, one each week on a Tuesday, Wednesday or Thursday, at $200 each.",
  },
];
