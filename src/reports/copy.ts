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
} as const;

/** The greeting line: the new shop reports, as the nav badge counts them. */
export function greeting(newReports: number): string {
  if (newReports === 0) return "No new reports.";
  return newReports === 1 ? "You have 1 new report." : `You have ${newReports} new reports.`;
}
