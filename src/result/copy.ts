// The result screen's words, exactly as Plot wrote them
// (docs/design/m1-copy.md, sections 4 to 6). Change them there first.
// The discoveries' own text is server-only: see discoveries.server.ts.
// {braces} are filled by the functions below.
import type { Assumption, Grade, MeasureId } from "~/game-stub/types";

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
  /**
   * Chart's placeholder words for the report card, from the names in
   * docs/design/scoring.md, until Plot writes its copy into m1-copy.md.
   */
  reportCard: {
    heading: "Report card",
    combined: "Combined score",
    holdCourse: "If you had held course",
    columns: { measure: "Measure", result: "This quarter", lastYear: "Q1 2193", goal: "Goal", score: "Score", holdCourse: "If you had held course" },
    measures: { profit: "Profit", readers: "Readers served", happiness: "Happiness", culture: "Culture" } satisfies Record<MeasureId, string>,
    exceeds: "Exceeds Requirements",
    wellRounded: "Well-Rounded Shop: all four measures scored 80 or above, which adds 3 to the combined score.",
    goalsNote: "Each goal is Q1 2193 plus 5%. Matching last year scores 65, a D; meeting the goal scores 100.",
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

/** `{score}, {grade}`: "83, B". */
export function scoreText(score: number, grade: Grade): string {
  return `${score}, ${gradeText(grade)}`;
}

/** The season note. */
export function seasonNote(pctBelowQ4: number, lastQ1: number): string {
  return `Q1 revenue was ${Math.round(pctBelowQ4)}% below Q4 2193. Last year, Q1 was also the quietest quarter: ${moneyText(lastQ1)}. To judge your plan, compare it with holding course, not with Q4.`;
}

/** `{found} of 3 found.` */
export function foundFooter(found: number): string {
  return `${found} of 3 found.`;
}
