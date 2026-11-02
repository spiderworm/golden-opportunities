// The Q2 decision screen's words, as Plot wrote them (docs/design/q2.md,
// section 5, with the form's legend, statuses and play-out from #145).
// Change them there first. What Q2 doesn't change (the
// rule line, the form's issuer and stamp, the confirm step) stays in copy.ts.
import { quarterIndex, quarterMonths, quarterNumber, type QuarterId } from "~/simulation/quarters";
import type { BossId } from "~/platform/bosses/bosses";
import type { MeasureId, Q2LeverId } from "~/simulation/types";
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
    taken: (month: string) => `Already picked for ${month}.`,
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

// From Q3 2194 on, every quarter is planned on Q2's form (docs/design/endless.md section 4), in the words of
// docs/design/endless-copy.md section 3. Q2's own strings fall out of the same rules.

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const LAST_DAY = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const MEASURE_NAMES: Record<MeasureId, string> = { profit: "Profit", readers: "Readers served", happiness: "Happiness", culture: "Culture" };

/** A quarter's name as the screens write it: "Q3 2194". */
export const quarterName = (quarter: QuarterId) => `Q${quarterNumber(quarter)} ${quarter.slice(0, 4)}`;

/** The quarter's three months by name: "July", "August", "September". */
export const monthNames = (quarter: QuarterId): string[] => quarterMonths(quarter).map((m) => MONTH_NAMES[Number(m.slice(5)) - 1]!);

/** It opens the sentence, so its first letter is a capital, whatever case the data gives (Plot, on #212). */
const capitalized = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/** "15%", from 0.15. */
const percentText = (fraction: number) => `${Math.round(fraction * 100)}%`;

/**
 * What the brief needs to know of the quarter (Frank's step 1, from Alma's record and the save). Null in Q2 2194,
 * which has no event, no stretch and no strikes.
 */
export interface PlanBrief {
  /** Strikes counting now. */
  strikes: number;
  /** The stretched goal, and its boss's line: Alma's capitals reason, or the server's recovery line. None while two strikes count. */
  stretch: { boss: BossId; measure: MeasureId; percent: number; line: string; recoveryFrom: QuarterId | null } | null;
  /** A format-costs event: the format, as the data names it, and its cost as a share of list price. */
  formatCost: { format: string; percent: number } | null;
  /** An author-fares event: an author night's cost, in dollars. */
  authorFare: number | null;
  /** An Orbitplace lot is on offer. */
  lot: boolean;
}

/** Each boss's eight rotating lines (endless-copy.md section 3), used by the quarter's place in the game mod 8. */
export const ROTATING_LINES: Record<BossId, readonly string[]> = {
  overall: [
    "MR. ZOOLANDER ONCE WORKED FOUR QUARTERS IN A ROW. HE CALLED IT A YEAR. WE HAVE ADOPTED THE TERM.",
    "A NEW QUARTER. IT HAS THREE MONTHS. WE COUNTED THEM PERSONALLY.",
    "YOUR SCORE IS STILL YOUR LOWEST MEASURE. WE HAVE NOT CHANGED THE RULE. WE ARE VERY CONSISTENT.",
    "THE STATION CONTINUES TO ORBIT. SO DOES YOUR SHOP. PLEASE KEEP IT THAT WAY.",
    "WE HAVE REVIEWED YOUR TENURE. IT IS ONGOING. WE APPROVE OF ONGOING.",
    "THE QUARTER BEGINS NOW. IT ENDS LATER. THIS IS HOW QUARTERS WORK.",
    "PLEASE FILE A PLAN. AN UNFILED PLAN IS ONLY A THOUGHT. WE DO NOT ACCEPT THOUGHTS.",
    "THE PANEL SENDS ITS REGARDS. THE PANEL HAS NO REGARDS. IT SENDS THEM ANYWAY.",
  ],
  profit: [
    "THE LEDGER HAS A NEW PAGE. IT IS BLANK. WE FIND THIS UNSETTLING.",
    "MR. ZOOLANDER HAS NEVER CHECKED A PRICE. WE CHECK EVERY PRICE. THIS IS WHY WE ARE NOT A MODEL.",
    "PROFIT IS REVENUE MINUS COST. WE CHECKED THIS WITH THREE CALCULATORS. TWO AGREED.",
    "EVERY BOOK COSTS SOMETHING. EVERY SALE MAKES SOMETHING. PLEASE MAKE MORE THAN IT COSTS.",
    "THE COMMERCE OFFICE HAS NO OPINION ON BOOKS. IT HAS MANY OPINIONS ON MONEY.",
    "A DISCOUNT IS A SMALL SADNESS. WE HAVE A FORM FOR SMALL SADNESSES.",
    "WE HAVE BOUGHT A SECOND SPREADSHEET. IT DISAGREES WITH THE FIRST. WE ARE MEDIATING.",
    "THE MONEY GOES IN THE LEDGER. PLEASE PUT MORE MONEY IN THE LEDGER.",
  ],
  culture: [
    "CULTURE IS ONGOING. IT CANNOT BE PAUSED. WE ASKED.",
    "AN AUTHOR IS A PERSON WHO WROTE A BOOK. WE HAVE MET SEVERAL. THEY WERE TALL.",
    "MR. ZOOLANDER HAS READ A BOOK. HE DID NOT SAY WHICH. THE MINISTRY RESPECTS HIS PRIVACY.",
    "THE MINISTRY HAS VISITED YOUR SHELVES. THE SHELVES WERE CULTURAL. PLEASE CONTINUE.",
    "A STATION WITHOUT BOOKS IS ONLY A STATION. WE HAVE SEEN ONE. IT WAS VERY QUIET.",
    "CULTURE CANNOT BE COUNTED. WE COUNT IT ANYWAY. IT IS OUR JOB.",
    "THE MINISTRY ENCOURAGES READING. THE MINISTRY ALSO ENCOURAGES BUYING THE BOOK FIRST.",
    "AUTHORS REMAIN AVAILABLE. THE SHUTTLE REMAINS EXPENSIVE. THESE FACTS ARE RELATED.",
  ],
  happiness: [
    "THE DRONE IS LISTENING. THE DRONE IS ALWAYS LISTENING. THIS IS ITS ONLY HOBBY.",
    "HAPPY READERS COME BACK. THE DRONE HAS COUNTED THEM. THE DRONE ENJOYED COUNTING.",
    "THE CALENDAR IS EMPTY AGAIN. THE DRONE CHECKED. THE DRONE STILL HAS NO HANDS.",
    "MR. ZOOLANDER SMILES ONLY ON SPECIAL OCCASIONS. THE DRONE WOULD LIKE YOUR READERS TO SMILE MORE OFTEN.",
    "THE DRONE HAS SURVEYED THE CORRIDOR. THE CORRIDOR HAD NO COMMENT.",
    "A GOOD PICK MAKES A READER HAPPY. A BAD PICK MAKES A READER QUIET. THE DRONE PREFERS NOISE.",
    "THE DRONE HAS BEEN SERVICED. IT IS READY TO BE DISAPPOINTED, OR NOT.",
    "PLEASE MAKE THE READERS HAPPY. THE DRONE WILL TAKE IT FROM THERE.",
  ],
  readers: [
    "THE DOOR IS OPEN. THE SUBCOMMITTEE HAS CONFIRMED THIS. TWICE.",
    "READERS ENTER. READERS LEAVE. WE WOULD LIKE MORE OF THE FIRST PART.",
    "PICK THREE BOOKS. THREE REMAINS THE NUMBER. WE HAVE NOT FOUND A BETTER ONE.",
    "THE SUBCOMMITTEE HAS MEASURED THE AISLE. IT CAN HOLD MORE READERS. PLEASE SEND THEM.",
    "MR. ZOOLANDER CANNOT TURN LEFT. YOUR READERS NEED ONLY TURN INTO THE SHOP. THE SUBCOMMITTEE BELIEVES IN THEM.",
    "A READER IS A PERSON WITH AN ORDER. THE SUBCOMMITTEE HAS NO OTHER DEFINITION. IT TRIED.",
    "THROUGHPUT IS PEOPLE PER QUARTER. WE WOULD LIKE MORE PEOPLE. WE WOULD LIKE THE SAME QUARTER.",
    "THE SHUTTLE BRINGS READERS. PLEASE HAVE SOMETHING FOR THEM TO READ.",
  ],
};

/** A line's first sentence, its teaser (as in Q2's brief). "MR." doesn't end one: "MR. ZOOLANDER HAS READ A BOOK." */
export const teaserOf = (line: string) => /^.*?(?<!\bMRS?|\bDR)[.!?](?=\s|$)/.exec(line)?.[0] ?? line;

/** Each boss's facts for a quarter after Q2 (endless-copy.md section 3, "The facts under each bubble"). */
function factsFor(boss: BossId, quarter: QuarterId, brief: PlanBrief | null): BriefingBubble["facts"] {
  const year = quarter.slice(0, 4);
  const months = monthNames(quarter);
  const lastMonth = Number(quarterMonths(quarter)[2]!.slice(5));
  switch (boss) {
    case "overall":
      return [
        `${quarterName(quarter)} runs `,
        { strong: `${months[0]} 1 to ${months[2]} ${LAST_DAY[lastMonth - 1]}, ${year}` },
        ". Your score is your ",
        { strong: "lowest measure" },
        ": Profit, Readers served, Happiness or Culture.",
        ...(brief?.strikes ? [" Strikes counting: ", { strong: String(brief.strikes) }, ". Three at once, and the panel removes you."] : []),
      ];
    case "profit":
      return [
        "Each goal starts from ",
        { strong: `Q${quarterNumber(quarter)} 2193` },
        ", adjusted for what the Council expects this quarter, then adds ",
        { strong: "5%" },
        ". ",
        ...(brief?.formatCost
          ? [{ strong: capitalized(brief.formatCost.format) }, " copies cost the store ", { strong: `${percentText(brief.formatCost.percent)} of their list price` }, " this quarter; other books, 60%."]
          : ["Books cost the store ", { strong: "60% of their list price" }, "."]),
      ];
    case "culture":
      return brief?.authorFare != null
        ? ["An author night costs ", { strong: `$${brief.authorFare}` }, " this quarter: the author's shuttle fare and the room."]
        : ["An author night costs ", { strong: "$200" }, ": the author's shuttle fare and the room."];
    case "happiness":
      return ["The Book of the Month calendar for ", { strong: `${months[0]}, ${months[1]} and ${months[2]}` }, " is empty. A pick is ", { strong: "15% off" }, " for its whole month."];
    case "readers":
      return [
        "Choose ",
        { strong: "up to three" },
        " picks, one for each month, and ",
        { strong: "up to one" },
        " more move. Choose nothing to hold course.",
        ...(brief?.lot ? [" An Orbitplace lot is on offer as well."] : []),
      ];
  }
}

/** The stretched boss's added fact: its raised goal, or the goal that restores a fall. */
function stretchFacts(stretch: NonNullable<PlanBrief["stretch"]>): BriefingBubble["facts"] {
  const measure = MEASURE_NAMES[stretch.measure];
  return [
    ` Its goal for ${measure} is `,
    { strong: percentText(stretch.percent) },
    stretch.recoveryFrom ? ` this quarter, to restore its fall in ${quarterName(stretch.recoveryFrom)}.` : " this quarter, instead of 5%.",
  ];
}

/**
 * The brief from Q3 on: Q2's five bosses in Q2's order. Each speaks its rotating line for the quarter, except the
 * stretched boss, who speaks the stretch's line; with two strikes counting, none is stretched.
 */
function laterBriefing(quarter: QuarterId, brief: PlanBrief | null): BriefingBubble[] {
  const place = quarterIndex(quarter) % 8;
  return DECIDE_Q2_COPY.briefing.map((bubble): BriefingBubble => {
    const stretched = brief?.stretch?.boss === bubble.boss ? brief.stretch : null;
    const line = stretched?.line ?? ROTATING_LINES[bubble.boss][place]!;
    const facts = factsFor(bubble.boss, quarter, brief);
    return { ...bubble, teaser: teaserOf(line), line, facts: stretched ? [...facts, ...stretchFacts(stretched)] : facts };
  });
}

/** The plan screen's words for a quarter after Q1: Q2 2194's exactly, and from Q3 on by the same rules. */
export function planCopy(quarter: QuarterId, brief: PlanBrief | null = null) {
  const months = monthNames(quarter);
  const fare = brief?.authorFare;
  return {
    months,
    heading: `PLAN FOR ${quarterName(quarter).toUpperCase()}`,
    // LKS-{year}-Q{n}-, then the quarter's place in the game + 2: Q1 2194's 0002, Q2's 0003 (endless-copy.md section 3).
    serial: `LKS-${quarter.slice(0, 4)}-Q${quarterNumber(quarter)}-${String(quarterIndex(quarter) + 2).padStart(4, "0")}`,
    playing: months.map((m) => `${m}...`),
    briefing: quarter === "2194-Q2" ? DECIDE_Q2_COPY.briefing : laterBriefing(quarter, brief),
    // With author fares, the author nights' figure and line name the fare.
    moves: fare == null ? Q2_MOVES : Q2_MOVES.map((m) => (m.id === "events" ? { ...m, figure: `$${fare} a night`, line: m.line.replace("at $200 each.", `at $${fare} each.`) } : m)),
  };
}
