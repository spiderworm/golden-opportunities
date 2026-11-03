import styles from "../Investigate.module.css";
import { drawsRange, fadedUnit, type CategoryModel } from "./category-chart";
import { fadedCaption, RANGE_EXPLAINED, RANGE_LEGEND } from "./evidence";

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

/**
 * What a chart's evidence marks mean (Plot, #296): average rating's whisker, with its explanation on hover and
 * focus, and a caption when some averages are faded for having too few to go on.
 */
export function EvidenceLegend({ model }: { model: CategoryModel }) {
  const range = drawsRange(model);
  const unit = fadedUnit(model);
  if (!range && !unit) return null;
  return (
    <ul className={styles.legend} aria-label="How sure these figures are">
      {range && (
        <li title={RANGE_EXPLAINED} tabIndex={0} aria-label={`${RANGE_LEGEND}. ${RANGE_EXPLAINED}`}>
          <span className={styles.rangeSwatch} aria-hidden="true" />
          {RANGE_LEGEND}
        </li>
      )}
      {unit && <li>{fadedCaption(unit)}</li>}
    </ul>
  );
}
