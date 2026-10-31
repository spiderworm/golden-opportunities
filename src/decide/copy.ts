// The decision screen's words, exactly as Plot wrote them
// (docs/design/m1-copy.md, section 3). Change them there first.
import type { BossId } from "~/platform/bosses/bosses";
import type { LeverId } from "~/simulation/types";

/** A fact strip's sentence: plain text, with the key figures in bold. */
export type FactLine = (string | { strong: string })[];

export interface BriefingBubble {
  boss: BossId;
  /** The boss's line, in capitals: the joke. */
  line: string;
  /** The fact strip: every fact of the brief appears once, in one strip. */
  facts: FactLine;
  /** The survey drone's bubble: the scheduled picks follow as a list. */
  picks?: true;
}

export const DECIDE_COPY = {
  heading: "PLAN FOR Q1 2194",
  /** The brief, from the bosses, in order. */
  briefing: [
    {
      boss: "overall",
      line: "ATTENTION, SHOPKEEPER. A NEW QUARTER HAS BEEN SCHEDULED. YOUR SCORE WILL BE YOUR WEAKEST MEASURE. WE CALL THIS TEAMWORK. MR. ZOOLANDER WOULD CALL IT ONE LOOK.",
      facts: [
        "Your plan runs from ",
        { strong: "January 1 to March 31, 2194" },
        ". Your score is your ",
        { strong: "lowest measure" },
        ": raise one by sinking another, and your score sinks with it.",
      ],
    },
    {
      boss: "profit",
      line: "WE WILL GRADE YOU ON FOUR MEASURES. WE CONSIDERED THREE. THREE SEEMED LENIENT. ALSO, BOOKS ARE NOT FREE. WE CHECKED.",
      facts: [
        "You're graded on ",
        { strong: "Profit, Readers served, Happiness and Culture" },
        ". Each goal is ",
        { strong: "last year's first quarter plus 5%" },
        ". Profit is revenue minus what the books cost, and books cost the store ",
        { strong: "60% of their list price" },
        ".",
      ],
    },
    {
      boss: "culture",
      line: "AUTHORS MAY BE INVITED. AUTHORS REQUIRE A SHUTTLE FARE. CULTURE IS EXPENSIVE. PLEASE PURCHASE SOME ANYWAY.",
      facts: ["An author night costs ", { strong: "$200" }, ": the author's shuttle fare and the room."],
    },
    {
      boss: "happiness",
      line: "THE PREVIOUS MANAGER LEFT A SCHEDULE. THE PREVIOUS MANAGER ALSO LEFT. WE ASSUME THEY COULD NOT TURN LEFT.",
      facts: ["Already scheduled, Book of the Month at ", { strong: "15% off" }, " for the whole month:"],
      picks: true,
    },
    {
      boss: "readers",
      line: "SELECT UP TO TWO MOVES. SELECTING THREE IS NOT PERMITTED. WE HAVE TESTED THIS PERSONALLY.",
      facts: ["Choose ", { strong: "up to two" }, " moves below, or none to hold course."],
    },
  ] satisfies BriefingBubble[] as BriefingBubble[],
  scheduled: [
    { month: "January", title: "The Mallemaroking", format: "mass market paperback" },
    { month: "February", title: "Rystwyth", format: "hardcover" },
    { month: "March", title: "Portmeirion", format: "mass market paperback" },
  ],
  movesHeading: "Your moves (choose up to two)",
  holdCourse: "Hold course: the schedule runs as it is.",
  tooMany: "You can choose up to two moves.",
  submit: "Submit plan",
  /** The plan didn't go in (a busy save, storage trouble): Chart's words, kept by Plot. */
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
