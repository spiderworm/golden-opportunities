// Reports' strings (docs/design/reports.md; Plot's, from Plot's review on #171). The page is plain chrome: the
// player's desk, with no boss lines.

export const REPORTS_COPY = {
  title: "Reports",
  /** Section 1: the shop's reports, at the top. */
  shopHeading: "Quarterly reports",
  /** Before any quarter is played: the player's section still works. */
  noQuarters: "No quarter has been filed yet. Your first report arrives when Q1 2194 closes.",
  /** A shop report's heading, and the link to its full results. */
  quarterReport: (quarter: string) => `${quarter} report`,
  fullResults: "See the full results",
  newBadge: "New",
  /** Read with the heading, so the card's name says it: "Q1 2194 report, new" (Audit, #281). */
  newName: ", new",
  /** The last played quarter's tiles: overall, then the four measures (the report card's names, in full). */
  tilesLabel: (quarter: string) => `${quarter}, the latest report`,
  overall: "Overall",
  /** Against the quarter before; Q1 2194 has none in the game, so against its own goal. */
  change: (delta: number, before: string) =>
    delta === 0
      ? `No change vs. ${before}`
      : `${delta > 0 ? "+" : "\u2212"}${Math.abs(delta)} vs. ${before}`,
  goalMet: "Goal met",
  /** No number: under a measure's name, points would read as the measure's own units (Plot, #282). */
  belowGoal: "Below goal",
  /** Overall score by quarter, with the strike line (endless.md section 7). */
  chartTitle: "Overall score by quarter",
  strikeLine: "Strike line (70)",
  /** A shop report's parts (section 2). */
  parts: {
    score: "Score",
    goals: "Against goals",
    plan: "Your plan",
    event: "Event",
    found: "What you found",
  },
  /** "74 (C), the binding measure: Readers served", ", strike" under 70. */
  heldCourse: "Held course",
  noPick: "No pick",
  months: (quarter: string) => {
    const q = Number(quarter.slice(-1));
    return [
      ["January", "February", "March"],
      ["April", "May", "June"],
      ["July", "August", "September"],
      ["October", "November", "December"],
    ][q - 1]!;
  },
  oneMore: (move: string) => `One more move: ${move}`,
  nothingFound: "Nothing found this quarter.",
  goalLine: (result: string, goal: string) => `${result} against a goal of ${goal}`,
  /** The memo's score line (endless-copy.md), so the report and the memo name it the same way (Plot, #282). */
  lowest: (measures: string) => `Lowest measure: ${measures}`,
  allMet: "Every measure met its goal",
} as const;

/** The greeting line: the new shop reports, as the nav badge counts them. */
export function greeting(newReports: number): string {
  if (newReports === 0) return "No new reports.";
  return newReports === 1 ? "You have 1 new report." : `You have ${newReports} new reports.`;
}
