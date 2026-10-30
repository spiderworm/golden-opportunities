import { Icon, type IconName } from "~/shell/icons";
import { change, formatDimensionShort, formatDimensionValue, formatMeasure, MEASURE_LABELS } from "./format";
import type { Tile } from "./investigation.server";
import styles from "./Investigate.module.css";

const ICONS: Record<Tile["measure"], IconName> = {
  revenue: "coins",
  units: "book",
  orders: "bag",
  avg_discount: "tag",
};

export function MetricTiles({ tiles }: { tiles: Tile[] }) {
  return (
    <section className={styles.tiles} aria-label="Key figures">
      {tiles.map((tile) => {
        const delta = change(tile.measure, tile.value, tile.previous);
        const tone = !delta || delta.good === null ? "neutral" : delta.good ? "up" : "down";
        return (
          <article key={tile.measure} className={styles.tile}>
            <header className={styles.tileHeader}>
              <span className={styles.tileIcon}>
                <Icon name={ICONS[tile.measure]} />
              </span>
              <h2 className={styles.tileLabel}>{MEASURE_LABELS[tile.measure]}</h2>
              <span className={styles.tilePeriod}>{formatDimensionValue("quarter", tile.quarter)}</span>
            </header>
            <div className={styles.tileBody}>
              <span className={styles.tileValue}>{formatMeasure(tile.measure, tile.value)}</span>
            </div>
            <div className={styles.tileChange}>
              {delta ? (
                <span className={styles.badge} data-tone={tone}>
                  {delta.text}
                  {delta.direction !== "flat" && <Icon name={delta.direction === "up" ? "arrowUp" : "arrowDown"} size={14} />}
                </span>
              ) : (
                <span className={styles.badge} data-tone="none">
                  {tile.previousQuarter
                    ? `No ${formatDimensionValue("quarter", tile.previousQuarter)} sales to compare`
                    : "Nothing earlier to compare"}
                </span>
              )}
              {delta && <span className={styles.tileCompare}>vs {formatDimensionShort("quarter", tile.previousQuarter)}</span>}
            </div>
          </article>
        );
      })}
    </section>
  );
}
