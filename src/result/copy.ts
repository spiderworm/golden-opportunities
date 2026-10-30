// The result screen's words, exactly as Plot wrote them
// (docs/design/m1-copy.md, sections 4 to 6). Change them there first.
// The discoveries' own text is server-only: see discoveries.server.ts.
// {braces} are filled by the functions below.
import type { Assumption, Grade, MeasureId, MeasureScore } from "~/game-stub/types";

export const RESULT_COPY = {
  title: "Q1 2194: the results",
  chartTitle: "Revenue by month",
  lines: { plan: "Your plan", holdCourse: "If you had held course", reference: "Q4 2193 (for reference)" },
  tiles: { grossProfit: "Gross profit", revenue: "Revenue", units: "Units sold" },
  holdCourseBadge: "Your plan was to hold course",
  seeAssumptions: "See the assumptions",
  backToLedgers: "Back to the ledgers",
  assumptions: {
    heading: "How this quarter was worked out",
    intro:
      'The simulation is small on purpose. Each line below is one rule it follows. "From your data" means it was measured from 2193. "Assumed" means the data can\'t show it, so we chose a value.',
    tags: { data: "From your data", assumed: "Assumed", setup: "Setup" } satisfies Record<Assumption["source"], string>,
    /** Shown on each rule the player's option used, so the highlight isn't color alone. */
    used: "Your plan used this rule.",
  },
  /** Section 4, "Report card". */
  reportCard: {
    heading: "Report card",
    combined: "Combined score",
    holdCourse: "If you had held course",
    columns: { measure: "Measure", result: "This quarter", lastYear: "Q1 2193", goal: "Goal", score: "Score", holdCourse: "If you had held course" },
    measures: { profit: "Profit", readers: "Readers served", happiness: "Happiness", culture: "Culture" } satisfies Record<MeasureId, string>,
    exceeds: "Exceeds Requirements",
    wellRounded: "Well-Rounded Shop: every measure scored 80 or more, which adds 3 to the combined score.",
    goalsNote: "Each goal is Q1 2193 plus 5%. Matching last year scores 65, a D. Meeting the goal scores 100, an A+.",
    bosses: {
      profit: "The Commerce Office",
      readers: "The Throughput Subcommittee",
      happiness: "The Readers' Guild survey drone",
      culture: "The Ministry of Culture",
      combined: "The Station Administrator",
    } satisfies Record<MeasureId | "combined", string>,
  },
  discoveries: {
    heading: "What you found",
    found: "Found",
    notFound: "Not found",
  },
} as const;

/** "$161,525": money in sentences. */
export function moneyText(value: number): string {
  return `$${Math.round(Math.abs(value)).toLocaleString("en-US")}`;
}

/** "$161.5k": money on tiles and axes. */
export function moneyShort(value: number): string {
  const abs = Math.abs(value);
  if (abs < 1000) return `$${Math.round(abs)}`;
  return `$${(abs / 1000).toFixed(1).replace(/\.0$/, "")}k`;
}

const sign = (value: number) => (value < 0 ? "-" : "+");

/** `{+/-}{amount} vs holding course` */
export function badgeText(amount: string, value: number): string {
  return `${sign(value)}${amount} vs holding course`;
}

/** A measure's value as the card shows it: whole dollars, whole orders and points, happiness to one decimal. */
export function measureText(id: MeasureId, value: number): string {
  switch (id) {
    case "profit":
      return `${value < 0 ? "-" : ""}${moneyText(value)}`;
    case "happiness":
      return value.toFixed(1);
    case "readers":
    case "culture":
      return Math.round(value).toLocaleString("en-US");
  }
}

/** "A-" set with a true minus sign. */
export function gradeText(grade: Grade): string {
  return grade.replace("-", "\u2212");
}

/** `{score} ({grade})`: "83 (B)". */
export function scoreText(score: number, grade: Grade): string {
  return `${score} (${gradeText(grade)})`;
}

/** `If you had held course: {score} ({grade})` */
export function heldCourseText(score: number, grade: Grade): string {
  return `${RESULT_COPY.reportCard.holdCourse}: ${scoreText(score, grade)}`;
}

/** Where a result stands: the boss lines turn on it. */
function standing(m: MeasureScore): "met" | "short" | "below" {
  return m.result >= m.goal ? "met" : m.result >= m.lastYear ? "short" : "below";
}

/** Whole percent change from last year: culture's {pct} and {goalPct}. */
const pctOver = (value: number, lastYear: number) => Math.round((value / lastYear - 1) * 100);

/** Each measure's boss on its result (section 4, "Boss lines"). The numbers are the card's. */
export function bossLine(m: MeasureScore): string {
  const result = measureText(m.id, m.result);
  const goal = measureText(m.id, m.goal);
  const lines: Record<MeasureId, Record<ReturnType<typeof standing>, string>> = {
    profit: {
      met: `PROFIT: ${result}. GOAL: ${goal}. THE GOAL HAS BEEN MET. WE ARE PLEASED. WE HAVE VOTED TO BE PLEASED.`,
      short: "PROFIT ROSE. IT DID NOT RISE ENOUGH. WE HAVE NOTED THIS IN A SPREADSHEET.",
      below: "PROFIT FELL BELOW LAST YEAR. THIS IS THE OPPOSITE OF WHAT WE REQUESTED.",
    },
    readers: {
      met: `${result} READERS PASSED THROUGH THE DOOR. THE DOOR PERFORMED ADMIRABLY. SO DID YOU.`,
      short: `${result} READERS. THE DOOR HAS CAPACITY FOR MORE. THE DOOR IS DISAPPOINTED.`,
      below: "FEWER READERS THAN LAST YEAR. WE HAVE INSPECTED THE DOOR. THE DOOR IS NOT AT FAULT.",
    },
    happiness: {
      met: `HAPPINESS: ${result}. THIS EXCEEDS THE REQUIRED HAPPINESS. PLEASE DO NOT BECOME COMPLACENT ABOUT HAPPINESS.`,
      short: `HAPPINESS: ${result}. PLEASE BE ${goal}.`,
      below: "HAPPINESS HAS DECLINED. THE DRONE HAS RECORDED SEVERAL SIGHS.",
    },
    culture: {
      met: "CULTURE INCREASED. YOU MAY CELEBRATE FOR 0.5 MINUTES.",
      short: `CULTURE INCREASED ${pctOver(m.result, m.lastYear)}%. CULTURE TARGET: ${pctOver(m.goal, m.lastYear)}%. PLEASE CULTURE HARDER.`,
      below: "CULTURE HAS DECREASED. THE MINISTRY IS UNCULTURED BY THIS.",
    },
  };
  return lines[m.id][standing(m)];
}

/** Simple fractions from three-fifths up, for the Administrator. */
const FRACTIONS: [number, string][] = [
  [3 / 5, "THREE-FIFTHS"],
  [2 / 3, "TWO-THIRDS"],
  [7 / 10, "SEVEN-TENTHS"],
  [3 / 4, "THREE-QUARTERS"],
  [4 / 5, "FOUR-FIFTHS"],
  [5 / 6, "FIVE-SIXTHS"],
  [9 / 10, "NINE-TENTHS"],
  [19 / 20, "NINETEEN-TWENTIETHS"],
];

/** `{fraction}`: the score as the nearest simple fraction, "ABOUT" unless it's exact. */
export function fractionWords(score: number): string {
  const [value, words] = FRACTIONS.reduce((best, f) => (Math.abs(f[0] * 100 - score) < Math.abs(best[0] * 100 - score) ? f : best));
  return Math.abs(value * 100 - score) < 1e-9 ? words : `ABOUT ${words}`;
}

/** The Station Administrator on the combined score. */
export function administratorLine(score: number): string {
  if (score >= 100) return `COMBINED SCORE: ${score}. THIS IS A WHOLE SHOP.`;
  if (score >= 60) return `COMBINED SCORE: ${score}. THIS IS ${fractionWords(score)} OF A SHOP. PLEASE ACQUIRE THE REMAINDER.`;
  return `COMBINED SCORE: ${score}. THE ADMINISTRATOR WILL NEED TO SIT DOWN.`;
}

/** The season note. */
export function seasonNote(pctBelowQ4: number, lastQ1: number): string {
  return `Q1 revenue was ${Math.round(pctBelowQ4)}% below Q4 2193. Last year, Q1 was also the quietest quarter: ${moneyText(lastQ1)}. To judge your plan, compare it with holding course, not with Q4.`;
}

/** `{found} of 3 found.` */
export function foundFooter(found: number): string {
  return `${found} of 3 found.`;
}
