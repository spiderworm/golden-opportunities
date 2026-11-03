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

/** The player's own reports (section 3). Plot's strings from #171, but those marked "Chart's", which wait on Plot. */
export const PLAYER_COPY = {
  heading: "Your reports",
  newReport: "New report",
  /** Chart's, Plot's wording (#284). */
  empty: "No reports yet. Choose New report to gather pinned charts and your notes on them.",
  limit: "You have 12 reports. Delete one to start another.",
  full: "A report holds up to 6 charts. Remove one to add another.",
  meta: (charts: number, quarter: string) =>
    `${charts} ${charts === 1 ? "chart" : "charts"} \u00b7 edited ${quarter}`,
  open: "Open",
  edit: "Edit",
  /** Chart's. */
  close: "Close",
  /** A chart over every quarter grows as quarters are played. */
  everyQuarter: "Every quarter played so far",
  title: "Title",
  summary: "Summary (optional)",
  note: "Note (optional)",
  moveUp: "Move up",
  moveDown: "Move down",
  remove: "Remove",
  addCharts: "Add charts",
  /** Chart's: the board is empty. */
  noPins: "Pin charts in Investigate to add them here.",
  /** Chart's: a pin already in the report. */
  inReport: "Already in this report",
  save: "Save report",
  cancel: "Cancel",
  noTitle: "Give the report a title.",
  noCharts: "Add at least one chart.",
  /** Chart's: anything else the save refused. */
  invalid: "This report couldn't be saved. Check the title, summary and notes, and try again.",
  /** Chart's: the save was busy (409); the draft is kept. */
  busy: "Your report didn't save. Please save it again.",
  /** Chart's: after removal, Add to report has nothing to offer. */
  closed: "Reports can still be read, but no longer made or changed.",
  leave: {
    question: "Leave without saving your changes to this report?",
    leave: "Leave",
    stay: "Keep editing",
  },
  delete: {
    button: "Delete report",
    question: (title: string) => `Delete "${title}"? This can't be undone.`,
    confirm: "Delete report",
    keep: "Keep it",
  },
  addToReport: "Add to report",
  newReportFromPin: "New report\u2026",
} as const;

/** Reports in Decide (section 4): read beside the plan, never touching it. Plot's strings from #171. */
export const DECIDE_COPY = {
  button: (n: number) => `Your reports (${n})`,
  /** No reports of the player's own, but a played quarter's forecast to judge (Plot, section 10). */
  forecasts: "Your forecasts",
  none: "No reports yet",
  heading: "Your reports",
  shopHeading: "Quarterly reports",
  /** Chart's: back from one report to the list. */
  back: "All reports",
  close: "Close",
  edit: "Edit in Reports",
  leave: {
    question: "Your plan isn't filed yet. Leaving Decide clears it. Go to Reports?",
    go: "Go to Reports",
    stay: "Stay on the plan",
  },
} as const;

/** The greeting line: the new shop reports, as the nav badge counts them. */
export function greeting(newReports: number): string {
  if (newReports === 0) return "No new reports.";
  return newReports === 1 ? "You have 1 new report." : `You have ${newReports} new reports.`;
}
