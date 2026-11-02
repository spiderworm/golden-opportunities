// The result screen's words, exactly as Plot wrote them
// (docs/design/m1-copy.md, sections 4 to 6). Change them there first.
// The discoveries' own text is server-only: see discoveries.server.ts.
// {braces} are filled by the functions below.
import { quarterNumber, type QuarterId } from "~/simulation/quarters";
import type { Assumption, Certificate, Grade, MeasureId, MeasureScore, ReportCard } from "~/simulation/types";
import { FORMAT_WORDS, GENRE_WORDS } from "~/simulation/words";

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
    /** Shown on each rule the player's plan used, so the highlight isn't color alone. */
    used: "Your plan used this rule.",
  },
  /** Section 4, "Report card". */
  reportCard: {
    heading: "Report card",
    overall: "Overall score",
    overallExplainer: "Your overall score is your lowest measure.",
    holdCourse: "If you had held course",
    binding: "Sets your score",
    closeBehind: "Close behind",
    columns: { measure: "Measure", result: "This quarter", lastYear: "Q1 2193", goal: "Goal", score: "Score", holdCourse: "If you had held course" },
    measures: { profit: "Profit", readers: "Readers served", happiness: "Happiness", culture: "Culture" } satisfies Record<MeasureId, string>,
    exceeds: "Exceeds Requirements",
    certificatesHeading: "Certificates",
    /** Small print under each certificate: a joke, carrying no information. */
    certificateIssuer: "Issued by the Center for Shopkeepers Who Can't Sell Good",
    goalsNote: "Each goal is Q1 2193 plus 5%. Matching last year scores 70 (C\u2212). Meeting the goal scores 100 (A+).",
    bossesDisclosure: "What the bosses said",
    bosses: {
      profit: "The Commerce Office",
      readers: "The Throughput Subcommittee",
      happiness: "The Readers' Guild survey drone",
      culture: "The Ministry of Culture",
      overall: "The Station Administrator",
    } satisfies Record<MeasureId | "overall", string>,
  },
  discoveries: {
    heading: "What you found",
    found: "Found",
    notFound: "Not found",
  },
} as const;

/** What differs between the two quarters' result screens (m1-copy.md section 4; q2.md section 7, with #139's answers). */
export const QUARTER_COPY = {
  "2194-Q1": {
    title: "Q1 2194: the results",
    reference: "Q4 2193 (for reference)",
    lastYear: "Q1 2193",
    goalsNote: RESULT_COPY.reportCard.goalsNote,
  },
  "2194-Q2": {
    title: "Q2 2194: the results",
    reference: "Q1 2194 (for reference)",
    lastYear: "Q2 2193 + new volume",
    goalsNote: "Each goal is Q2 2193, plus the new volume's expected effect, plus 5%. Matching Q2 2193 plus the new volume scores 70 (C\u2212). Meeting the goal scores 100 (A+).",
  },
} as const;
export type ResultQuarter = keyof typeof QUARTER_COPY;

/** "Q3 2194", from "2194-Q3". */
export const quarterName = (quarter: QuarterId | string) => `${quarter.slice(5)} ${quarter.slice(0, 4)}`;

/**
 * What differs by quarter, for any quarter (docs/design/endless-copy.md section 4): Q1's and Q2's exactly as above,
 * and from Q3 on by Plot's rules. The reference quarter's name comes from the server, which knows what it holds.
 */
export function quarterCopy(quarter: QuarterId, referenceLabel: string) {
  if (quarter === "2194-Q1" || quarter === "2194-Q2") return QUARTER_COPY[quarter];
  const base = `Q${quarterNumber(quarter)} 2193`;
  return {
    title: `${quarterName(quarter)}: the results`,
    reference: `${referenceLabel} (for reference)`,
    lastYear: `${base}, adjusted`,
    goalsNote: `Each goal is ${base}, adjusted for what the Council expected this quarter, plus 5%. Matching the adjusted ${base} scores 70 (C\u2212). Meeting the goal scores 100 (A+).`,
  };
}

/** The primary button while the game goes on: "Continue to Q2" after Q1, as it always was; then "Continue to Q4 2194". */
export const continueTo = (next: QuarterId) => (next === "2194-Q2" ? CONTINUE_TO_Q2 : `Continue to ${quarterName(next)}`);

/** A word that starts a title opens with a capital: "Science fiction and fantasy orders rising in August". */
const opening = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** An event as the service record names it (endless-copy.md section 1), from Alma's type and params. */
export function eventTitle(quarter: QuarterId, event: { type: string; params: Readonly<Record<string, string | number>> } | null): string {
  if (!event) return quarter === "2194-Q2" ? "The new Inspector Ryeslton volume" : "None";
  const p = event.params;
  // An event's month is its place in the quarter, 1 to 3.
  const month = () => MONTH_NAMES[(quarterNumber(quarter) - 1) * 3 + Number(p.month) - 1]!;
  switch (event.type) {
    case "genre_surge":
      return `${opening(GENRE_WORDS[String(p.genre)] ?? String(p.genre))} orders rising in ${month()}`;
    case "genre_slump":
      return `${opening(GENRE_WORDS[String(p.genre)] ?? String(p.genre))} orders falling in ${month()}`;
    case "quiet_days":
      return `Quiet ${p.weekday}s`;
    case "author_fares":
      return `Author nights at $${p.cost}`;
    case "format_costs":
      return `${opening(FORMAT_WORDS[String(p.format)] ?? String(p.format))} costs at ${p.percent}%`;
    case "quiet_quarter":
      return "A quiet quarter";
    default:
      // Alma's types are a fixed list (src/alma/events.ts); a test checks each has a title here.
      return "None";
  }
}

/** The service record (endless.md section 6), which follows every result from Q2 on once the half-year review goes. */
export const SERVICE_RECORD = {
  heading: "Service record",
  columns: { quarter: "Quarter", profit: "Profit", readers: "Readers served", happiness: "Happiness", culture: "Culture", overall: "Overall", event: "Event" },
  strike: ", strike",
  tenure: (quarters: number, mean: number, grade: Grade) =>
    `Manager since January 1, 2194: ${quarters} ${quarters === 1 ? "quarter" : "quarters"}. Average overall score: ${mean} (${grade}).`,
  best: (quarter: QuarterId, score: number, grade: Grade) => `Best quarter: ${quarterName(quarter)}, ${score} (${grade}).`,
} as const;

/** After Q1, while Q2 is still to play (q2.md section 7): the primary button, to the station on April 1. */
export const CONTINUE_TO_Q2 = "Continue to Q2";

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

/**
 * A goal and a result at display precision, never on opposite sides of each
 * other from the engine's verdict. Goals round up, so the shown goal is never
 * less than what meeting it takes (7,166.25 readers shows as 7,167). Results
 * round to nearest unless that crosses the shown goal; then they round toward
 * the verdict: up when the goal was met, down when it wasn't. `met` comes from
 * the score, never from these numbers.
 */
export function shownAgainstGoal(value: number, goal: number, met: boolean, step: number): { value: number; goal: number } {
  // Steps are 1 and 0.1: scale by a whole number, which keeps 68.3 at 683 (68.3 / 0.1 is 682.99...).
  const per = Math.round(1 / step);
  // The slack absorbs float noise: a 5% goal computes as 5.0000000001%, which shouldn't show as 6%.
  const shownGoal = Math.ceil(goal * per - 1e-9);
  let shown = Math.round(value * per);
  if (met && shown < shownGoal) shown = Math.ceil(value * per);
  if (!met && shown >= shownGoal) shown = Math.min(Math.floor(value * per), shownGoal - 1);
  return { value: shown / per, goal: shownGoal / per };
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

/** The engine's own verdict, never worked out from rounded numbers. */
const metGoal = (m: MeasureScore) => m.met;

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
      met: `PROFIT: ${result}. GOAL: ${goal}. THE GOAL HAS BEEN MET. WE ARE PLEASED. WE HAVE VOTED TO BE PLEASED. WE ARE DOING BLUE STEEL.`,
      short: "PROFIT ROSE. IT DID NOT RISE ENOUGH. WE HAVE NOTED THIS IN A SPREADSHEET. THE SPREADSHEET IS IN THE COMPUTER.",
      below: "PROFIT FELL BELOW LAST YEAR. THIS IS THE OPPOSITE OF WHAT WE REQUESTED.",
    },
    readers: {
      met: `${result} READERS PASSED THROUGH THE DOOR. THE DOOR PERFORMED ADMIRABLY. SO DID YOU.`,
      short: `${result} READERS. THE DOOR HAS CAPACITY FOR MORE. THE DOOR IS DISAPPOINTED.`,
      below: "FEWER READERS THAN LAST YEAR. WHAT IS THIS, A SHOP FOR ANTS? IT NEEDS TO BE AT LEAST THREE TIMES BIGGER.",
    },
    happiness: {
      met: `HAPPINESS: ${result}. THIS EXCEEDS THE REQUIRED HAPPINESS. PLEASE DO NOT BECOME COMPLACENT ABOUT HAPPINESS.`,
      short: `HAPPINESS: ${result}. PLEASE BE ${goal}.`,
      below: "HAPPINESS HAS DECLINED. THE DRONE HAS DETECTED MOISTURE. MR. ZOOLANDER CALLS THIS THE ESSENCE OF WETNESS.",
    },
    culture: {
      met: "CULTURE INCREASED. YOU MAY CELEBRATE FOR 0.5 MINUTES. A WALK-OFF IS PERMITTED.",
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

/** The Station Administrator on the overall score. */
export function administratorLine(score: number): string {
  if (score >= 100) return `OVERALL SCORE: ${score}. THIS IS A WHOLE SHOP. IT IS REALLY, REALLY, RIDICULOUSLY GOOD-LOOKING.`;
  if (score >= 60) return `OVERALL SCORE: ${score}. THIS IS ${fractionWords(score)} OF A SHOP. PLEASE ACQUIRE THE REMAINDER.`;
  return `OVERALL SCORE: ${score}. THE ADMINISTRATOR WILL NEED TO SIT DOWN.`;
}

/** `{MEASURE}`: the measure's name in capitals. */
const MEASURE_CAPS: Record<MeasureId, string> = { profit: "PROFIT", readers: "READERS SERVED", happiness: "HAPPINESS", culture: "CULTURE" };

/** "A AND B", "A, B AND C". */
function names(list: string[]): string {
  return list.length < 2 ? (list[0] ?? "") : `${list.slice(0, -1).join(", ")} AND ${list.at(-1)}`;
}

/**
 * The lowest-measure lines under the overall score (section 4, "Lowest-measure
 * lines"). The engine decides every condition: allMet, binding, sacrifice and
 * closeBehind (closest first). These only pick the words.
 */
export function lowestMeasureLines(card: ReportCard): string[] {
  const { overall } = card;
  if (overall.allMet) return ["ALL MEASURES MET REQUIREMENTS. YOUR SCORE IS 100. WE ARE RECALIBRATING OUR EXPECTATIONS UPWARD."];
  const binders = overall.binding.map((id) => MEASURE_CAPS[id]);
  const lines = [
    binders.length === 1
      ? `${binders[0]} HAS SET YOUR SCORE: ${overall.score}. THE OTHER MEASURES WERE IRRELEVANT. WE ADMIRED THEM BRIEFLY.`
      : `${names(binders)} HAVE JOINTLY SET YOUR SCORE: ${overall.score}. WE ARE SUSPICIOUS OF TIES.`,
  ];
  if (overall.sacrifice) lines.push("YOU RAISED ONE MEASURE BY LOWERING ANOTHER. WE ONLY COUNT THE LOWER ONE. THIS IS POLICY.");
  const close = overall.closeBehind[0];
  if (close) {
    const n = card.measures.find((m) => m.id === close)!.score - overall.score;
    lines.push(`${MEASURE_CAPS[close]} WAS ${n} ${n === 1 ? "POINT" : "POINTS"} FROM SETTING YOUR SCORE. IT IS WATCHING.`);
  }
  return lines;
}

/** Who speaks the lowest-measure lines: the binding measure's boss, or bosses on a tie. */
export function lowestMeasureSpeakers(card: ReportCard): string {
  const c = RESULT_COPY.reportCard;
  if (card.overall.allMet) return c.bosses.overall;
  // "The Commerce Office and the Ministry of Culture": only the first name opens with a capital.
  const bosses = card.overall.binding.map((id, i) => (i === 0 ? c.bosses[id] : c.bosses[id].replace(/^The /, "the ")));
  return bosses.length < 2 ? bosses[0]! : `${bosses.slice(0, -1).join(", ")} and ${bosses.at(-1)}`;
}

/** A certificate's words. */
export function certificateText(certificate: Certificate): string {
  switch (certificate.id) {
    case "exceeds":
      return `Exceeds Requirements: ${RESULT_COPY.reportCard.measures[certificate.measure!]} beat its goal. Certificates don't change your score.`;
    case "wellRounded":
      return "Well-Rounded Shop: every measure scored 80 or more.";
    // Neither can happen in M1 (one quarter, no Alma), so Plot hasn't written them yet.
    case "comeback":
    case "weathered":
      return "";
  }
}

/** The season note. */
export function seasonNote(pctBelowQ4: number, lastQ1: number): string {
  return `Q1 revenue was ${Math.round(pctBelowQ4)}% below Q4 2193. Last year, Q1 was also the quietest quarter: ${moneyText(lastQ1)}. To judge your plan, compare it with holding course, not with Q4.`;
}

/**
 * Q2's season note (q2.md section 7): this Q2 against the player's own Q1, then last year's two. Plot fixed
 * last year's figures in the copy; they're the ledger's (Q2 2193 $164,437, 73% above Q1 2193).
 */
export function q2SeasonNote(revenue: number, q1Revenue: number): string {
  const pct = Math.round(Math.abs(revenue / q1Revenue - 1) * 100);
  return `Q2 revenue was ${pct}% ${revenue >= q1Revenue ? "above" : "below"} Q1 2194. Last year, Q2 was the busier quarter: $164,437, 73% above Q1. To judge your plan, compare it with holding course, not with Q1.`;
}

/**
 * From Q3 on (endless-copy.md section 4): the quarter against the one before, then 2193's same two quarters, which
 * the server sends with Frank's next step (season2193). Until then, the middle sentence is left out.
 */
export function laterSeasonNote(
  quarter: QuarterId,
  revenue: number,
  previous: number,
  previousLabel: string,
  season2193?: { quarter: number; before: number; beforeLabel: string },
): string {
  const pct = Math.round(Math.abs(revenue / previous - 1) * 100);
  const last = season2193
    ? ` In 2193, Q${quarterNumber(quarter)} brought in ${moneyText(season2193.quarter)}, and ${season2193.beforeLabel} ${moneyText(season2193.before)}.`
    : "";
  return `${quarterName(quarter)} revenue was ${pct}% ${revenue >= previous ? "above" : "below"} ${previousLabel}.${last} To judge your plan, compare it with holding course, not with ${previousLabel}.`;
}

/** Section 7 of docs/design/q2.md: the review under Q2's result, which ends the game. */
export const HALF_YEAR_COPY = {
  heading: "Half-year review",
  closing: "That's the end of the first half of 2194. Thanks for minding the shop.",
  /** The table: a row per quarter, with each measure's score and the overall score (q2.md, #139). */
  quarter: "Quarter",
  overall: "Overall",
  quarters: { "2194-Q1": "Q1 2194", "2194-Q2": "Q2 2194" } satisfies Record<ResultQuarter, string>,
  playAgain: "Play again",
  backToLedgers: "Back to the ledgers",
} as const;

/** `Half-year score: {score} ({grade})` */
export function halfYearScoreText(score: number, grade: Grade): string {
  return `Half-year score: ${scoreText(score, grade)}`;
}

/** The Station Administrator on the half-year score: 80 or above, 70 to 79, below 70. */
export function halfYearAdministratorLine(score: number): string {
  if (score >= 80) return `HALF-YEAR SCORE: ${score}. TWO GOOD QUARTERS IN A ROW. WE DID NOT KNOW THIS WAS PERMITTED. WE ARE DOING MAGNUM.`;
  if (score >= 70) return `HALF-YEAR SCORE: ${score}. THE SHOP CONTINUES. THIS IS ALSO A LOOK.`;
  return `HALF-YEAR SCORE: ${score}. THE ADMINISTRATOR WILL NEED TO SIT DOWN AGAIN.`;
}

/** `{found} of 3 found.` */
export function foundFooter(found: number): string {
  return `${found} of 3 found.`;
}
