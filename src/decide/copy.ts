// The decision screen's words, exactly as Plot wrote them
// (docs/design/m1-copy.md, section 3). Change them there first.
import type { BossId } from "~/platform/bosses/bosses";
import type { FactLine } from "~/platform/bosses/facts";
import type { LeverId } from "~/simulation/types";

export interface BriefingBubble {
  boss: BossId;
  /** What the bubble shows until it's selected: the line's opening, no joke yet. */
  teaser: string;
  /** The boss's line, in capitals: the joke. */
  line: string;
  /** The fact strip: every fact of the brief appears once, in one strip. */
  facts: FactLine;
  /** The survey drone's bubble: the scheduled picks follow as a list. */
  picks?: true;
}

export const DECIDE_COPY = {
  heading: "PLAN FOR Q1 2194",
  /** Under the heading: the bubbles open when selected. */
  hint: "Select a boss to hear more.",
  /** The brief, from the bosses, in order. */
  briefing: [
    {
      boss: "overall",
      teaser: "ATTENTION, SHOPKEEPER. A NEW QUARTER.",
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
      teaser: "WE WILL GRADE YOU ON FOUR MEASURES.",
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
      teaser: "AUTHORS MAY BE INVITED.",
      line: "AUTHORS MAY BE INVITED. AUTHORS REQUIRE A SHUTTLE FARE. CULTURE IS EXPENSIVE. PLEASE PURCHASE SOME ANYWAY.",
      facts: ["An author night costs ", { strong: "$200" }, ": the author's shuttle fare and the room."],
    },
    {
      boss: "happiness",
      teaser: "THE PREVIOUS MANAGER LEFT A SCHEDULE.",
      line: "THE PREVIOUS MANAGER LEFT A SCHEDULE. THE PREVIOUS MANAGER ALSO LEFT. WE ASSUME THEY COULD NOT TURN LEFT.",
      facts: ["Already scheduled, Book of the Month at ", { strong: "15% off" }, " for the whole month:"],
      picks: true,
    },
    {
      boss: "readers",
      teaser: "SELECT UP TO TWO MOVES.",
      line: "SELECT UP TO TWO MOVES. SELECTING THREE IS NOT PERMITTED. WE HAVE TESTED THIS PERSONALLY.",
      facts: ["Choose ", { strong: "up to two" }, " moves, or none to hold course."],
    },
  ] satisfies BriefingBubble[] as BriefingBubble[],
  scheduled: [
    { month: "January", title: "The Mallemaroking", format: "mass market paperback" },
    { month: "February", title: "Rystwyth", format: "hardcover" },
    { month: "March", title: "Portmeirion", format: "mass market paperback" },
  ],
  movesHeading: "Your moves (choose up to two)",
  /** The button that pins a move's whole line open: its visible label, closed and open, then "about {move}" for screen readers. */
  more: "More",
  less: "Less",
  moreAbout: "about",
  /** The moves as a requisition form the bosses issue: its chrome is decoration (aria-hidden); the checkboxes carry the choice. */
  form: {
    issuer: ["THROUGHPUT SUBCOMMITTEE", "FORM TS-2: REQUISITION OF MOVES"],
    serial: "LKS-2194-Q1-0002",
    stamp: "REQUISITIONED",
    /** Small print at the foot of the form. */
    footer: "Two moves maximum. Filed requisitions are final.",
  },
  /** Under the moves heading: the rule the choice turns on, so no closed bubble hides it. */
  rule: ["Your score is your ", { strong: "lowest measure" }, ": Profit, Readers served, Happiness or Culture."] as FactLine,
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
export const MOVES: { id: LeverId; title: string; line: string; /** A key figure kept on the title line, so the line's clamp never hides it. */ figure?: string }[] = [
  {
    id: "repick",
    title: "Re-pick Book of the Month",
    figure: "3 hardcovers",
    line: "Feature Kalakalal Avenue (January), Can I Be Honest? (February) and Who Did You Think You Were Kidding? (March), all in hardcover, instead of the scheduled picks (The Mallemaroking, Rystwyth and Portmeirion).",
  },
  { id: "events", title: "Weekday author nights", figure: "$200 a night", line: "Host 12 author nights, one each week on a Tuesday, Wednesday or Thursday, at $200 each." },
  { id: "sale", title: "Station-wide sale", figure: "15% off", line: "15% off every book, all quarter. The Book of the Month runs at the same 15%." },
];
