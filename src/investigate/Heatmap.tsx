import { useMemo } from "react";

import type { QueryResult } from "~/query/types";
import { chartTheme, heatColor } from "~/platform/charts/chart-theme";
import { Dropdown } from "~/platform/ui/Dropdown";
import { cellSelected, heatAxis, heatModel, type HeatModel } from "./charts/heat-model";
import { DIMENSION_LABELS, formatDimensionShort, formatDimensionValue, formatMeasure, MEASURE_LABELS } from "./format";
import { CHART_MEASURES, HEAT_DIMENSIONS, type ChartMeasure, type Filters, type HeatDimension, type HeatState, type InvestigateState } from "./state";
import styles from "./Investigate.module.css";

export interface HeatmapProps {
  state: InvestigateState;
  result: QueryResult;
  quarters: readonly string[];
  onCell: (row: string, col: string) => void;
  /** The heatmap's measure or axes changed. */
  onHeat: (heat: HeatState) => void;
}

/** "Revenue by weekday and month". */
export const heatTitle = (heat: HeatState) => `${MEASURE_LABELS[heat.measure]} by ${DIMENSION_LABELS[heat.rows].toLowerCase()} and ${DIMENSION_LABELS[heat.cols].toLowerCase()}`;

/**
 * The heatmap card: one measure down one dimension and across another (David, 2 Nov 2026: "the same level of
 * customization that we've given to charts"), weekday by month unless the player chooses otherwise.
 */
export function Heatmap({ state, result, quarters, onCell, onHeat }: HeatmapProps) {
  const { heat } = state;
  const model = useMemo(
    () => heatModel(result, heat.measure, heat.rows, heatAxis(heat.rows, result, quarters, state.filters), heat.cols, heatAxis(heat.cols, result, quarters, state.filters)),
    [result, heat.measure, heat.rows, heat.cols, quarters, state.filters],
  );
  const title = heatTitle(heat);
  // Each axis offers every dimension but the other axis's: never the same one twice.
  const axisOptions = (other: HeatDimension) => HEAT_DIMENSIONS.filter((d) => d !== other).map((d) => ({ value: d, label: DIMENSION_LABELS[d] }));

  return (
    <section className={styles.card} aria-labelledby="heatmap-title">
      <header className={styles.cardHeader}>
        <h2 id="heatmap-title" className={styles.cardTitle}>
          {title}
        </h2>
        <div className={styles.cardControls}>
          <Dropdown
            mode="single"
            name="Show"
            value={heat.measure}
            onChange={(measure: ChartMeasure) => onHeat({ ...heat, measure })}
            options={CHART_MEASURES.map((m) => ({ value: m, label: MEASURE_LABELS[m] }))}
          />
          <Dropdown mode="single" name="Rows" value={heat.rows} onChange={(rows: HeatDimension) => onHeat({ ...heat, rows })} options={axisOptions(heat.cols)} />
          <Dropdown mode="single" name="Columns" value={heat.cols} onChange={(cols: HeatDimension) => onHeat({ ...heat, cols })} options={axisOptions(heat.rows)} />
        </div>
      </header>
      <HeatScale measure={heat.measure} model={model} />
      <HeatGrid model={model} measure={heat.measure} rowsBy={heat.rows} colsBy={heat.cols} filters={state.filters} label={title} onCell={onCell} />
      <p className={styles.source}>
        {`Click a cell to filter the screen to that ${DIMENSION_LABELS[heat.rows].toLowerCase()} and ${DIMENSION_LABELS[heat.cols].toLowerCase()}. Source: ${result.source}`}
      </p>
    </section>
  );
}

/** The color ramp, from the grid's lowest value to its highest. */
export function HeatScale({ measure, model }: { measure: ChartMeasure; model: HeatModel }) {
  return (
    <div className={styles.scale} aria-hidden="true">
      <span>{formatMeasure(measure, model.min, { compact: true })}</span>
      <span className={styles.scaleBar} style={{ background: `linear-gradient(90deg, ${chartTheme.heatRamp.join(", ")})` }} />
      <span>{formatMeasure(measure, model.max, { compact: true })}</span>
    </div>
  );
}

/**
 * The grid, drawn as a table of buttons rather than a chart: every cell is focusable, labelled, and
 * server-rendered with its value. Without `onCell` (a pin), cells are plain text.
 */
export function HeatGrid({
  model,
  measure,
  rowsBy,
  colsBy,
  filters = {},
  label,
  onCell,
}: {
  model: HeatModel;
  measure: ChartMeasure;
  rowsBy: HeatDimension;
  colsBy: HeatDimension;
  filters?: Filters;
  label: string;
  onCell?: (row: string, col: string) => void;
}) {
  const anySelected = !!(filters[rowsBy] || filters[colsBy]);
  const span = model.max - model.min || 1;
  const valueAt = new Map(model.cells.map(([x, y, v]) => [`${x},${y}`, v]));
  const known = (values: (string | null)[]) => values.filter((v): v is string => v !== null);

  return (
    <div className={styles.heatmap} role="table" aria-label={label} style={{ gridTemplateColumns: `auto repeat(${model.cols.length}, minmax(0, 1fr))` }}>
      <div role="row" className={styles.heatRow}>
        <span role="columnheader" />
        {model.cols.map((c) => (
          <span key={c ?? "\u0000"} role="columnheader" className={styles.heatColumnLabel}>
            {formatDimensionShort(colsBy, c, known(model.cols))}
          </span>
        ))}
      </div>
      {model.rows.map((row, y) => (
        <div key={row ?? "\u0000"} role="row" className={styles.heatRow}>
          <span role="rowheader" className={styles.heatRowLabel}>
            {formatDimensionShort(rowsBy, row, known(model.rows))}
          </span>
          {model.cols.map((col, x) => {
            const value = valueAt.get(`${x},${y}`) ?? null;
            const t = value === null ? 0 : (value - model.min) / span;
            const selected = cellSelected(filters, rowsBy, row, colsBy, col);
            const dimmed = anySelected && !selected;
            const name = `${formatDimensionValue(rowsBy, row)}, ${formatDimensionValue(colsBy, col)}: ${formatMeasure(measure, value)}`;
            const style = { background: value === null ? "transparent" : heatColor(t), color: t > 0.75 && value !== null ? chartTheme.inkOnLight : chartTheme.inkOnDark };
            const text = formatMeasure(measure, value, { compact: true });
            // An unknown value can't be filtered on: the query API has no null filter.
            const clickable = onCell && row !== null && col !== null;
            return (
              <span key={col ?? "\u0000"} role="cell">
                {clickable ? (
                  <button
                    type="button"
                    className={styles.heatCell}
                    data-dimmed={dimmed || undefined}
                    data-tip={name}
                    aria-label={name}
                    aria-pressed={anySelected && selected}
                    style={style}
                    onClick={() => onCell(row, col)}
                  >
                    {text}
                  </button>
                ) : (
                  <span className={styles.heatCell} data-tip={name} aria-label={name} style={style}>
                    {text}
                  </span>
                )}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}
