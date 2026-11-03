import styles from "../Investigate.module.css";

/**
 * Chart or table, one at a time (David, 3 Nov 2026: "tables to toggle to charts, and charts to toggle to
 * tables"): the main chart's Table button, shared by every chart and table that can be shown both ways.
 */
export function TableToggle({
  table,
  onChange,
  label,
}: {
  table: boolean;
  onChange: (table: boolean) => void;
  /** Names what it switches, where a page shows several ("Table: Revenue by month"). */
  label?: string;
}) {
  return (
    <button
      type="button"
      className={styles.toggle}
      aria-pressed={table}
      aria-label={label ? `Table: ${label}` : undefined}
      onClick={() => onChange(!table)}
    >
      Table
    </button>
  );
}
