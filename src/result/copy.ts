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

/** The precision the card shows each measure at: whole dollars, orders and points, happiness to one decimal. */
const STEP: Record<MeasureId, number> = { profit: 1, readers: 1, happiness: 0.1, culture: 1 };

/** A number already at its measure's precision, as the card writes it. */
function formatMeasure(id: MeasureId, value: number): string {
  switch (id) {
    case "profit":
      return `${value < 0 ? "-" : ""}${moneyText(value)}`;
    case "happiness":
      return value.toFixed(1);
    case "readers":
    case "culture":
      return value.toLocaleString("en-US");
  }
}

/** Rounds to a step, with a little slack so 68.3 / 0.1 doesn't land on 683.0000001. */
const toStep = (value: number, step: number, round: (x: number) => number) => round(value / step + (round === Math.ceil ? -1e-9 : 1e-9)) * step;

/**
 * A goal and a result at display precision. Goals round up, so the shown goal
 * is never less than what meeting it takes (7,166.25 readers shows as 7,167).
 * A result short of its goal never shows as reaching the shown goal: it rounds
 * down instead. Whether the goal was met comes from the score, never from these.
 */
export function shownAgainstGoal(value: number, goal: number, met: boolean, step: number): { value: number; goal: number } {
  const shownGoal = toStep(goal, step, Math.ceil);
  let shown = Math.round(value / step) * step;
  if (!met && shown >= shownGoal) shown = toStep(value, step, Math.floor);
  return { value: shown, goal: shownGoal };
}

/** A measure's result, goal and last year as the card shows them. */
export function measureTexts(m: MeasureScore): { result: string; goal: string; lastYear: string } {
  const step = STEP[m.id];
  const shown = shownAgainstGoal(m.result, m.goal, metGoal(m), step);
  return {
    result: formatMeasure(m.id, shown.value),
    goal: formatMeasure(m.id, shown.goal),
    lastYear: formatMeasure(m.id, Math.round(m.lastYear / step) * step),
  };
}

/** The engine's own verdict: only a result at or past the goal scores 100. */
const metGoal = (m: MeasureScore) => m.score >= 100;

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
  return metGoal(m) ? "met" : m.result >= m.lastYear ? "short" : "below";
}

/** Each measure's boss on its result (section 4, "Boss lines"). The numbers are the card's. */
export function bossLine(m: MeasureScore): string {
  const { result, goal } = measureTexts(m);
  // Culture's {pct} and {goalPct}: whole percents over last year, held to the same rounding rule.
  const pct = shownAgainstGoal((m.result / m.lastYear - 1) * 100, (m.goal / m.lastYear - 1) * 100, metGoal(m), 1);
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
      short: `CULTURE INCREASED ${pct.value}%. CULTURE TARGET: ${pct.goal}%. PLEASE CULTURE HARDER.`,
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
