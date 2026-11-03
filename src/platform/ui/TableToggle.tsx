import styles from "./TableToggle.module.css";

/**
 * Chart or table, one at a time (David, 3 Nov 2026: "tables to toggle to charts, and charts to toggle to
 * tables"): the main chart's Table button, shared by every chart and table that can be shown both ways, in
 * Investigate, Reports, Decide and Dewey's chat (so it's platform code, styled by the page through `className`). Pressed
 * shows the table; the name never changes (Plot, chart-features-copy.md section 1). Where there's no chart to
 * draw, it's off and says why.
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
    <button
      type="button"
      className={className}
      aria-pressed={table}
      aria-label={label ? `Table: ${label}` : undefined}
      disabled={!!disabledReason}
      title={disabledReason ?? undefined}
      onClick={() => onChange(!table)}
    >
      Table
    </button>
  );
}

/** Why there's no chart to toggle to (Plot, chart-features-copy.md section 1). */
export const NO_CHART = {
  figure: "A single figure has no chart",
  tooMany: (n: number, max: number) =>
    `Too many groups to chart (${n}). Filter to ${max} or fewer.`,
  comparison: "Two values read best as a table",
} as const;

/**
 * The reason a pin or report item has no chart, for its toggle: from its spec (a comparison, one figure), or once
 * it's run, too many groups for the palette. Null when it can be drawn.
 */
export function noChartReason(
  before: "comparison" | "figure" | null,
  tooMany: number | null,
  max: number,
): string | null {
  return before ? NO_CHART[before] : tooMany !== null ? NO_CHART.tooMany(tooMany, max) : null;
}
