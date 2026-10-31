import { useMemo } from "react";

import type { QueryResult } from "~/query/types";
import { chartTheme, heatColor } from "~/platform/charts/chart-theme";
import { cellSelected, heatModel, WEEKDAYS } from "./charts/heat-model";
import { formatDimensionShort, formatDimensionValue, formatMeasure, MEASURE_LABELS } from "./format";
import { monthsInScope, type InvestigateState } from "./state";
import styles from "./Investigate.module.css";

export interface HeatmapProps {
  state: InvestigateState;
  result: QueryResult;
  quarters: readonly string[];
  onCell: (weekday: string, month: string) => void;
}

/**
 * Weekday by month, drawn as a grid of buttons rather than a chart: every cell
 * is focusable, labelled, and server-rendered with its value.
 */
export function Heatmap({ state, result, quarters, onCell }: HeatmapProps) {
  const months = monthsInScope(quarters, state.filters.quarter);
  const model = useMemo(() => heatModel(result, state.measure, months), [result, state.measure, months.join()]);
  const title = `${MEASURE_LABELS[state.measure]} by weekday and month`;
  const anySelected = !!(state.filters.weekday || state.filters.month);
  const span = model.max - model.min || 1;
  const valueAt = new Map(model.cells.map(([x, y, v]) => [`${x},${y}`, v]));

  return (
    <section className={styles.card} aria-labelledby="heatmap-title">
      <header className={styles.cardHeader}>
        <h2 id="heatmap-title" className={styles.cardTitle}>
          {title}
        </h2>
        <div className={styles.scale} aria-hidden="true">
          <span>{formatMeasure(state.measure, model.min, { compact: true })}</span>
          <span className={styles.scaleBar} style={{ background: `linear-gradient(90deg, ${chartTheme.heatRamp.join(", ")})` }} />
          <span>{formatMeasure(state.measure, model.max, { compact: true })}</span>
        </div>
      </header>

      <div className={styles.heatmap} role="table" aria-label={title} style={{ gridTemplateColumns: `auto repeat(${model.months.length}, minmax(0, 1fr))` }}>
        <div role="row" className={styles.heatRow}>
          <span role="columnheader" />
          {model.months.map((m) => (
            <span key={m} role="columnheader" className={styles.heatColumnLabel}>
              {formatDimensionShort("month", m, model.months)}
            </span>
          ))}
        </div>
        {WEEKDAYS.map((weekday, y) => (
          <div key={weekday} role="row" className={styles.heatRow}>
            <span role="rowheader" className={styles.heatRowLabel}>
              {formatDimensionShort("weekday", weekday)}
            </span>
            {model.months.map((month, x) => {
              const value = valueAt.get(`${x},${y}`) ?? null;
              const t = value === null ? 0 : (value - model.min) / span;
              const selected = cellSelected(state.filters, weekday, month);
              const dimmed = anySelected && !selected;
              const formatted = formatMeasure(state.measure, value);
              const label = `${weekday}s in ${formatDimensionValue("month", month)}: ${formatted}`;
              return (
                <span key={month} role="cell">
                  <button
                    type="button"
                    className={styles.heatCell}
                    data-dimmed={dimmed || undefined}
                    data-tip={label}
                    aria-label={label}
                    aria-pressed={anySelected && selected}
                    style={{
                      background: value === null ? "transparent" : heatColor(t),
                      color: t > 0.75 && value !== null ? chartTheme.inkOnLight : chartTheme.inkOnDark,
                    }}
                    onClick={() => onCell(weekday, month)}
                  >
                    {formatMeasure(state.measure, value, { compact: true })}
                  </button>
                </span>
              );
            })}
          </div>
        ))}
      </div>
      <p className={styles.source}>Click a cell to filter the screen to that weekday and month. Source: {result.source}</p>
    </section>
  );
}
