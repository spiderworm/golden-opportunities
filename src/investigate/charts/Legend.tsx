import styles from "../Investigate.module.css";

/** The legend for split charts: a swatch beside each series name, in text colors. */
export function Legend({ items, label }: { items: { label: string; color: string }[]; label: string }) {
  if (items.length < 2) return null;
  return (
    <ul className={styles.legend} aria-label={label}>
      {items.map((item) => (
        <li key={item.label}>
          <span className={styles.legendSwatch} style={{ background: item.color }} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
