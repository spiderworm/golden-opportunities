import { useEffect, useMemo, useRef, useState } from "react";

import { ResultTable } from "./charts/ResultTable";
import { TableToggle } from "./charts/TableToggle";
import type { QueryResult } from "~/query/types";
import { chartTheme, heatColor } from "~/platform/charts/chart-theme";
import { Dropdown } from "~/platform/ui/Dropdown";
import { Icon } from "~/shell/icons";
import { cellSelected, heatAxis, heatModel, type HeatModel } from "./charts/heat-model";
import {
  DIMENSION_LABELS,
  formatDimensionShort,
  formatDimensionValue,
  formatMeasure,
  MEASURE_LABELS,
} from "./format";
import {
  CHART_MEASURES,
  filtersExcept,
  HEAT_DIMENSIONS,
  HEAT_WINDOW,
  heatSpanFilter,
  heatWindow,
  type ChartMeasure,
  type Filters,
  type HeatDimension,
  type HeatState,
  type InvestigateState,
} from "./state";
import styles from "./Investigate.module.css";

export interface HeatmapProps {
  state: InvestigateState;
  result: QueryResult;
  quarters: readonly string[];
  onCell: (row: string, col: string) => void;
  /** The heatmap's measure or axes changed. */
  onHeat: (heat: HeatState) => void;
  /** Pins this heatmap to the pinned charts; `pinned` when an identical one is already there. */
  onPin: (table: boolean) => void;
  pinned: boolean;
  /** The grid toggled to its table, or back. */
  onTable?: (table: boolean) => void;
}

/** What a heatmap says when the terminal's row limit left cells out: those cells are blank, not zero. */
export const CUT_NOTE = "This grid is too large to show in full. Narrow it with a filter.";
/** The same, when the player chose every quarter over a long ledger: the window is the other way out (Plot). */
export const CUT_NOTE_ALL =
  "This grid is too large to show in full. Narrow it with a filter, or choose Last eight quarters.";
/** Why Period can't be changed: the screen's own quarter (or else month) filter decides the span (Plot). */
const PERIOD_FOLLOWS = {
  quarter: "Following the screen's quarter filter.",
  month: "Following the screen's month filter.",
} as const;
/** A cut-off cell's label (Plot, #264). */
const CUT_CELL = "Not shown: the grid was cut off.";

/** "Revenue by weekday and month". */
export const heatTitle = (heat: HeatState, windowed = false) =>
  `${MEASURE_LABELS[heat.measure]} by ${DIMENSION_LABELS[heat.rows].toLowerCase()} and ${DIMENSION_LABELS[heat.cols].toLowerCase()}${windowed ? ", last eight quarters" : ""}`;

/**
 * The heatmap card: one measure down one dimension and across another (David, 2 Nov 2026: "the same level of
 * customization that we've given to charts"), weekday by month unless the player chooses otherwise.
 */
export function Heatmap({
  state,
  result,
  quarters,
  onCell,
  onHeat,
  onPin,
  pinned,
  onTable,
}: HeatmapProps) {
  // A choice shows at once, and the next one builds on it, though the URL only takes it when the navigation lands:
  // otherwise Rows then Columns, picked quickly, loses Rows (measured in heatmap.spec.ts).
  const [pending, setPending] = useState<HeatState | null>(null);
  // Its rows as a table instead of the grid (David, 3 Nov 2026); for this view, as the main chart's Table.
  const [table, setTable] = useState(false);
  useEffect(() => setPending(null), [state.heat.measure, state.heat.rows, state.heat.cols]);
  const heat = pending ?? state.heat;
  const choose = (next: HeatState) => {
    setPending(next);
    onHeat(next);
  };
  // The grid draws the result it has, for the heatmap that was asked; the controls show the latest choice.
  const shown = state.heat;
  // A long ledger's heatmap shows its last eight quarters unless the player chose every one (heatWindow); its axes
  // follow the same span as its query.
  const window = heatWindow(state, quarters);
  // The axes' span, as the query's: the screen's filters but those on the heatmap's own axes, then the window.
  const outside = filtersExcept(state.filters, [shown.rows, shown.cols]);
  const scope = window ? { ...outside, quarter: window } : outside;
  const long = quarters.length > HEAT_WINDOW;
  const span = heatSpanFilter(state);
  const model = useMemo(
    () =>
      heatModel(
        result,
        shown.measure,
        shown.rows,
        heatAxis(shown.rows, result, quarters, scope),
        shown.cols,
        heatAxis(shown.cols, result, quarters, scope),
      ),
    [result, shown.measure, shown.rows, shown.cols, quarters, state.filters, window?.join()],
  );
  const title = heatTitle(shown, window !== null);
  // Each axis offers every dimension but the other axis's: never the same one twice.
  const axisOptions = (other: HeatDimension) =>
    HEAT_DIMENSIONS.filter((d) => d !== other).map((d) => ({
      value: d,
      label: DIMENSION_LABELS[d],
    }));

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
            onChange={(measure: ChartMeasure) => choose({ ...heat, measure })}
            options={CHART_MEASURES.map((m) => ({ value: m, label: MEASURE_LABELS[m] }))}
          />
          <Dropdown
            mode="single"
            name="Rows"
            value={heat.rows}
            onChange={(rows: HeatDimension) => choose({ ...heat, rows })}
            options={axisOptions(heat.cols)}
          />
          <Dropdown
            mode="single"
            name="Columns"
            value={heat.cols}
            onChange={(cols: HeatDimension) => choose({ ...heat, cols })}
            options={axisOptions(heat.rows)}
          />
          {/* Only once the ledger holds more than eight quarters: before that, every quarter is the last eight (Plot). */}
          {long && (
            <Dropdown
              mode="single"
              name="Period"
              value={heat.period}
              onChange={(period: HeatState["period"]) => choose({ ...heat, period })}
              options={[
                { value: "recent" as const, label: "Last eight quarters" },
                { value: "all" as const, label: "Every quarter" },
              ].map((o) => ({ ...o, disabledReason: span ? PERIOD_FOLLOWS[span] : null }))}
            />
          )}
          <TableToggle
            table={table}
            onChange={(next) => {
              setTable(next);
              onTable?.(next);
            }}
          />
          <button
            type="button"
            className={styles.toggle}
            onClick={() => onPin(table)}
            disabled={pinned}
            title={pinned ? "Already pinned" : "Pin this heatmap below"}
          >
            <Icon name="pin" size={14} /> {pinned ? "Pinned" : "Pin"}
          </button>
        </div>
      </header>
      {table ? (
        <ResultTable result={result} />
      ) : (
        <>
          <HeatScale measure={shown.measure} model={model} />
          <HeatGrid
            model={model}
            measure={shown.measure}
            rowsBy={shown.rows}
            colsBy={shown.cols}
            filters={state.filters}
            label={title}
            onCell={onCell}
          />
        </>
      )}
      {model.cut && (
        <p className={styles.source}>
          {long && shown.period === "all" && !span ? CUT_NOTE_ALL : CUT_NOTE}
        </p>
      )}
      <p className={styles.source}>
        {/* The table has no cells to click: only its source. */}
        {table
          ? `Source: ${result.source}`
          : `Click a cell to filter the screen to that ${DIMENSION_LABELS[shown.rows].toLowerCase()} and ${DIMENSION_LABELS[shown.cols].toLowerCase()}. Source: ${result.source}`}
      </p>
    </section>
  );
}

/** The color ramp, from the grid's lowest value to its highest. */
export function HeatScale({ measure, model }: { measure: ChartMeasure; model: HeatModel }) {
  return (
    <div className={styles.scale} aria-hidden="true">
      <span>{formatMeasure(measure, model.min, { compact: true })}</span>
      <span
        className={styles.scaleBar}
        style={{ background: `linear-gradient(90deg, ${chartTheme.heatRamp.join(", ")})` }}
      />
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
  const fit = useCellFit(model.cols.length);

  return (
    <div
      ref={fit.ref}
      className={styles.heatmap}
      role="table"
      aria-label={label}
      data-fit={fit.fit}
      style={{ gridTemplateColumns: `auto repeat(${model.cols.length}, minmax(0, 1fr))` }}
    >
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
            // In a cut result, a cell with no value is one the terminal left out, not one with no sales.
            const missing = model.missing.has(`${x},${y}`);
            const name = `${formatDimensionValue(rowsBy, row)}, ${formatDimensionValue(colsBy, col)}: ${missing ? CUT_CELL : formatMeasure(measure, value)}`;
            const style = {
              background: value === null ? "transparent" : heatColor(t),
              color: t > 0.75 && value !== null ? chartTheme.inkOnLight : chartTheme.inkOnDark,
            };
            const text = missing ? "" : formatMeasure(measure, value, { compact: true });
            // An unknown value can't be filtered on: the query API has no null filter.
            const clickable = onCell && row !== null && col !== null;
            return (
              <span key={col ?? "\u0000"} role="cell">
                {clickable ? (
                  <button
                    type="button"
                    className={styles.heatCell}
                    data-dimmed={dimmed || undefined}
                    data-cut={missing || undefined}
                    data-tip={name}
                    aria-label={name}
                    aria-pressed={anySelected && selected}
                    style={style}
                    onClick={() => onCell(row, col)}
                  >
                    {text}
                  </button>
                ) : (
                  <span
                    className={styles.heatCell}
                    data-tip={name}
                    aria-label={name}
                    data-cut={missing || undefined}
                    style={style}
                  >
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

/** A cell's width at which its compact figure ("$14.9K") fits at 12 px, and at 10 px; under that, colour alone. */
export const CELL_FIT = { full: 48, small: 38 } as const;

/** How the figures fit cells this wide: "full", "small", or "none" (colour alone; the value stays in the tooltip). */
export function cellFit(cellWidth: number): "full" | "small" | "none" {
  return cellWidth >= CELL_FIT.full ? "full" : cellWidth >= CELL_FIT.small ? "small" : "none";
}

/**
 * The grid's cells measured as its width changes (the window, or Dewey's column beside it): CSS can't know how many
 * columns there are, so a container query alone can't say when twelve months' figures stop fitting. The label column
 * takes about 48 px. Full until measured, as the server draws it.
 */
function useCellFit(columns: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<"full" | "small" | "none">("full");
  useEffect(() => {
    const grid = ref.current;
    if (!grid || typeof ResizeObserver === "undefined") return;
    const measure = () => setFit(cellFit((grid.clientWidth - 48) / Math.max(1, columns) - 4));
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(grid);
    return () => watch.disconnect();
  }, [columns]);
  return { ref, fit };
}
