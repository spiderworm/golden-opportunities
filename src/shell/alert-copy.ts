// The Commerce Office's alerts, one per quarter, each delivered three ways: the
// transmission on arrival, the standing-order strip until the plan is in, and
// the bell's archived copy. Plot's strings: Q1's in docs/design/m1-copy.md
// (section 1), Q2's in docs/design/q2.md (section 2). The memo's facts stay plain.
import type { FactLine } from "~/platform/bosses/facts";
import type { Grade, MeasureId } from "~/simulation/types";

export interface AlertCopy {
  /** The bell's id for it. */
  id: string;
  transmission: {
    label: string;
    kicker: string;
    line: string;
    memoHeader: readonly string[];
    memo: readonly FactLine[];
    open: string;
    later: string;
  };
  strip: { long: FactLine; short: FactLine; ledgers: string; memo: string };
  bell: { title: string; detail: string };
}

/** Q1's: the revenue fell in Q4. */
export const ALERT_COPY = {
  id: "q4-revenue-down",
  transmission: {
    /** The dialog's accessible name. */
    label: "Transmission from the Commerce Office",
    kicker: "INCOMING TRANSMISSION",
    line: "THE NUMBERS HAVE GONE DOWN. WE PREFER UP. MR. ZOOLANDER TEACHES THAT ONE MUST ALWAYS LOOK. PLEASE LOOK AT THE LEDGERS.",
    memoHeader: [
      "LARKSPUR STATION / COMMERCE OFFICE",
      "Quarterly review: Orbital Books, Ring C, Berth 14",
      "2194 Jan 1",
    ],
    memo: [
      ["Fourth-quarter revenue: $161,525. Third quarter: $274,036. ", { strong: "Down 41%." }],
      [
        "The Commerce Office expects a plan for the first quarter before the shuttle season ends. Your ledgers are on the console, and Dewey can help you read them there.",
      ],
      ["Submit your plan when you are ready."],
    ],
    open: "Open the ledgers",
    later: "Later",
  },
  strip: {
    long: [
      "Standing order from the Commerce Office: Q4 revenue is down ",
      { strong: "41%" },
      " on Q3. Submit a plan for Q1 2194.",
    ],
    short: ["Standing order: Q4 revenue down ", { strong: "41%" }, ". Plan due for Q1 2194."],
    ledgers: "Open the ledgers",
    memo: "Read the memo",
  },
  bell: {
    title: "Q4 revenue is down 41% on Q3",
    detail: "Find out what happened, then submit a plan for Q1 2194.",
  },
} as const satisfies AlertCopy;

/** Q2's bell, as getStationState lists it (Frank's game state uses this; q2AlertCopy has the rest). */
export const Q2_ALERT_COPY = {
  bell: {
    title: "The Q2 Book of the Month calendar is empty",
    detail: "Choose the picks, then submit a plan for Q2 2194.",
  },
} as const;

const MEASURE_NAMES: Record<MeasureId, string> = {
  profit: "Profit",
  readers: "Readers served",
  happiness: "Happiness",
  culture: "Culture",
};

/** "Profit", "Profit and Happiness", "Profit, Happiness and Culture": in report-card order, as the engine lists them. */
function measureNames(ids: readonly MeasureId[]): string {
  const list = ids.map((id) => MEASURE_NAMES[id]);
  return list.length < 2 ? (list[0] ?? "") : `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`;
}

/** Q1's result as the Q2 memo quotes it: the report card's overall score and its binding measures. */
export interface FirstQuarter {
  score: number;
  grade: Grade;
  binding: readonly MeasureId[];
}

/** Q2's: the Book of the Month calendar is empty (q2.md, section 2). Its first line quotes Q1's report card. */
export function q2AlertCopy(q1: FirstQuarter): AlertCopy {
  return {
    id: "q2-calendar-empty",
    transmission: {
      ...ALERT_COPY.transmission,
      line: "THE FIRST QUARTER HAS BEEN FILED. IT CANNOT BE UNFILED. WE TRIED. THE CALENDAR IS NOW EMPTY. MR. ZOOLANDER WOULD FILL IT WITH SOMETHING REALLY, REALLY GOOD-LOOKING. PLEASE FILL IT.",
      memoHeader: [
        "LARKSPUR STATION / COMMERCE OFFICE",
        "Quarterly review: Orbital Books, Ring C, Berth 14",
        "2194 Apr 1",
      ],
      memo: [
        // At 100 every measure met its goal, so none is lowest (Plot, #139).
        [
          `First-quarter overall score: ${q1.score} (${q1.grade.replace("-", "\u2212")}). ${q1.score >= 100 ? "Every measure met its goal." : `Lowest measure: ${measureNames(q1.binding)}.`}`,
        ],
        [
          "The Book of the Month calendar for the second quarter is empty. The previous manager's schedule ended in March. The Commerce Office expects the picks, and a plan, before the shuttle season begins.",
        ],
        ["Your ledgers now include Q1 2194, and Dewey can help you read them there."],
        ["Submit your plan when you are ready."],
      ],
    },
    strip: {
      ...ALERT_COPY.strip,
      long: [
        "Standing order from the Commerce Office: the Book of the Month calendar for Q2 is empty. Submit your picks and a plan for Q2 2194.",
      ],
      short: ["Standing order: Q2 picks needed. Plan due for Q2 2194."],
    },
    bell: Q2_ALERT_COPY.bell,
  };
}
