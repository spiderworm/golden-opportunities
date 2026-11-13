import { ReasonToggle } from "./ReasonToggle";
import styles from "./TableToggle.module.css";

/**
 * Chart or table, one at a time (David, 3 Nov 2026: "tables to toggle to charts, and charts to toggle to
 * tables"): the main chart's Table button, shared by every chart and table that can be shown both ways, in
 * Investigate, Reports, Decide and Dewey's chat (so it's platform code, styled by the page through `className`). Pressed
 * shows the table; the name never changes (Plot, chart-features-copy.md section 1). Where there's no chart to
 * draw, it's off and says why, as a ReasonToggle (Frank's #301): still focusable, its reason shown on hover and
 * focus and read out, rather than a disabled button's title that keyboards and screen readers miss (Plot).
 */
export function TableToggle({
  table,
  onChange,
  label,
  disabledReason,
  className = styles.toggle,
}: {
  table: boolean;
  onChange: (table: boolean) => void;
  /** Names what it switches, where a page shows several ("Table: Revenue by month"). */
  label?: string;
  /** Why there's no chart: one of NO_CHART's. */
  disabledReason?: string | null;
  /** The page's own toggle style; this file's otherwise. */
  className?: string;
}) {
  return (
    <ReasonToggle
      className={className}
      pressed={table}
      label={label ? `Table: ${label}` : undefined}
      reason={disabledReason ?? null}
      onToggle={() => onChange(!table)}
    >
      Table
    </ReasonToggle>
  );
}

/** Why there's no chart to toggle to (Plot, chart-features-copy.md section 1). */
export const NO_CHART = {
  figure: "A single figure has no chart",
  tooMany: (n: number, max: number) =>
    `Too many groups to chart (${n}). Filter to ${max} or fewer.`,
  comparison: "Two values read best as a table",
  // A lookup of several measures that one chart can't draw (Plot, section 11; Investigate's rule, David, 2 Nov 2026).
  books: "Ratings and checkouts chart one at a time",
  measures: "Too many measures to chart (4). A chart shows 3 at most.",
  axes: "These measures need three axes, and a chart has two",
  breakdown: "A chart of several measures takes one breakdown",
} as const;

/** NO_CHART's reasons that are known before a chart is run: every one but too many groups. */
export type NoChartKey = Exclude<keyof typeof NO_CHART, "tooMany">;

/**
 * The reason a pin or report item has no chart, for its toggle: from its spec (a comparison, one figure), or once
 * it's run, too many groups for the palette. Null when it can be drawn.
 */
export function noChartReason(
  before: NoChartKey | null,
  tooMany: number | null,
  max: number,
): string | null {
  return before ? NO_CHART[before] : tooMany !== null ? NO_CHART.tooMany(tooMany, max) : null;
}
