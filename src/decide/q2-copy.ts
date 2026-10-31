// The Q2 decision screen's words, as Plot wrote them (docs/design/q2.md,
// section 5, with the form's legend, statuses and play-out from #145).
// Change them there first. What Q2 doesn't change (the
// rule line, the form's issuer and stamp, the confirm step) stays in copy.ts.
import type { Q2LeverId } from "~/simulation/types";
import { DECIDE_COPY, MOVES, type BriefingBubble } from "./copy";

export const MONTHS = ["April", "May", "June"] as const;
export type Month = (typeof MONTHS)[number];

export const DECIDE_Q2_COPY = {
  heading: "PLAN FOR Q2 2194",
  /** The brief, from the bosses, in order (q2.md section 5). The rule each one states is in its fact strip. */
  briefing: [
    {
      boss: "overall",
      teaser: "QUARTER TWO.",
      line: "QUARTER TWO. IT IS LIKE QUARTER ONE, BUT TWO. MR. ZOOLANDER ALSO RETURNED FOR A SECOND ONE. IT WAS NECESSARY.",
      facts: [
        "Q2 runs ",
        { strong: "April 1 to June 30, 2194" },
        ". Your score is your ",
        { strong: "lowest measure" },
        ": Profit, Readers served, Happiness or Culture.",
      ],
    },
    {
      boss: "profit",
      teaser: "YOUR FIRST QUARTER IS IN THE LEDGER.",
      line: "YOUR FIRST QUARTER IS NOW IN THE LEDGER. THE LEDGER REMEMBERS EVERYTHING. THE LEDGER IS VERY GOOD-LOOKING.",
      facts: [
        "Each goal starts from ",
        { strong: "last year's second quarter" },
        ", adds the new Inspector Ryeslton volume's expected effect, then adds ",
        { strong: "5%" },
        ". Books cost the store ",
        { strong: "60% of their list price" },
        ".",
      ],
    },
    {
      boss: "culture",
      teaser: "AUTHORS REMAIN AVAILABLE.",
      line: "AUTHORS REMAIN AVAILABLE. THEIR SHUTTLE FARES HAVE NOT DECREASED. WE ASKED. WE DID BLUE STEEL. THE FARES DID NOT MOVE.",
      facts: ["An author night costs ", { strong: "$200" }, ": the author's shuttle fare and the room."],
    },
    {
      boss: "happiness",
      teaser: "THE CALENDAR IS EMPTY.",
      line: "THE CALENDAR IS EMPTY. THE DRONE HAS CHECKED IT TWICE. THE DRONE CANNOT PICK BOOKS. THE DRONE HAS NO HANDS.",
      facts: [
        "The Book of the Month calendar for ",
        { strong: "April, May and June" },
        " is empty. A pick is ",
        { strong: "15% off" },
        " for its whole month.",
      ],
    },
    {
      boss: "readers",
      teaser: "PICK THREE BOOKS.",
      line: "PICK THREE BOOKS. THREE IS ALSO HOW MANY LOOKS MR. ZOOLANDER HAS. THEY ARE THE SAME LOOK. WE ADMIRE THIS.",
      facts: ["Choose ", { strong: "up to three" }, " picks, one for each month, and ", { strong: "up to one" }, " more move. Choose nothing to hold course."],
    },
  ] satisfies BriefingBubble[] as BriefingBubble[],
  movesHeading: "Your moves (up to three picks and one more)",
  picks: {
    label: "BOOK OF THE MONTH",
    none: "No pick",
    search: "Find a title",
    /** Shown on another month's pick, which can't be picked twice. */
    taken: (month: Month) => `Already picked for ${month}.`,
    /** What the list says when the search finds nothing. */
    nothing: "No title matches.",
  },
  moreLabel: "ONE MORE MOVE (OPTIONAL)",
  form: {
    serial: "LKS-2194-Q2-0003",
    footer: "Three picks and one move maximum. Filed requisitions are final.",
  },
  holdCourse: "Hold course: no picks and no other move.",
  tooMany: "You can choose only one more move.",
  playing: ["April...", "May...", "June..."],
} as const;

/** An edition as the picker shows it: only what's printed on the book (q2.md section 5). */
export const editionLabel = (e: { title: string; format: string; listPrice: number }) =>
  `${e.title} (${e.format.toLowerCase()}), $${e.listPrice.toFixed(2)}`;

/** The one more move: M1's author nights and sale, moved to Q2's dates. */
export const Q2_MOVES = MOVES.filter((m): m is (typeof MOVES)[number] & { id: Q2LeverId } => m.id === "events" || m.id === "sale");

export { DECIDE_COPY };
