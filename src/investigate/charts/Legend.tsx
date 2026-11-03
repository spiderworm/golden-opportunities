import styles from "../Investigate.module.css";

/** The legend for split charts: a swatch beside each series name, in text colors. */
export function Legend({
  items,
  label,
}: {
  /** `opacity` draws a series' swatch lighter, as last year's is drawn (last-year.ts). */
  items: { label: string; color: string; opacity?: number }[];
  label: string;
}) {
  if (items.length < 2) return null;
  return (
    <ul className={styles.legend} aria-label={label}>
      {items.map((item) => (
        <li key={item.label}>
          <span
            className={styles.legendSwatch}
            style={{ background: item.color, opacity: item.opacity }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
