import { useMemo, useState } from "react";

import type { QueryResult } from "~/query/types";
import { barHeight, barModel, barOption, TOP_RANKED } from "./charts/bar-option";
import { quarterColor } from "./charts/chart-theme";
import { EChart } from "./charts/EChart";
import { DIMENSION_LABELS, formatDimensionValue, formatMeasure, MEASURE_LABELS } from "./format";
import { canCompare, monthsInScope, CHART_MEASURES, GROUPINGS, type ChartMeasure, type Grouping, type InvestigateState } from "./state";
import styles from "./Investigate.module.css";

export interface MeasureChartProps {
  state: InvestigateState;
  result: QueryResult;
  quarters: readonly string[];
  onMeasure: (measure: ChartMeasure) => void;
  onGroup: (by: Grouping) => void;
  onCompare: (compare: boolean) => void;
  onDrill: (value: string) => void;
  onTable: (shown: boolean) => void;
}

export function MeasureChart({ state, result, quarters, onMeasure, onGroup, onCompare, onDrill, onTable }: MeasureChartProps) {
  const [table, setTable] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const selected = state.filters[state.by] ?? [];
  const months = state.by === "month" ? monthsInScope(quarters, state.filters.quarter) : [];
  const model = useMemo(
    () => barModel(result, state.by, state.compare, months, { top: showAll ? undefined : TOP_RANKED, keep: selected }),
    [result, state.by, state.compare, months.join(), showAll, selected.join("\u0000")],
  );
  const option = useMemo(
    () => barOption(model, { measure: state.measure, by: state.by, selected, quarters }),
    // selected is derived from state.filters, which changes identity with each navigation.
    [model, state.measure, state.by, selected.join("\u0000"), quarters],
  );
  const title = `${MEASURE_LABELS[state.measure]} by ${DIMENSION_LABELS[state.by].toLowerCase()}`;

  function drillAt(index: number) {
    const value = model.categories[index];
    // Unknown groups can't be filtered on: the query API has no null filter.
    if (value !== null && value !== undefined) onDrill(value);
  }

  return (
    <section className={`${styles.card} ${styles.chartCard}`} aria-labelledby="measure-chart-title">
      <header className={styles.cardHeader}>
        <h2 id="measure-chart-title" className={styles.cardTitle}>
          {title}
        </h2>
        <div className={styles.cardControls}>
          <label className={styles.select}>
            <span className={styles.selectLabel}>Show</span>
            <select value={state.measure} onChange={(e) => onMeasure(e.target.value as ChartMeasure)}>
              {CHART_MEASURES.map((m) => (
                <option key={m} value={m}>
                  {MEASURE_LABELS[m]}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.select}>
            <span className={styles.selectLabel}>By</span>
            <select value={state.by} onChange={(e) => onGroup(e.target.value as Grouping)}>
              {GROUPINGS.map((g) => (
                <option key={g} value={g}>
                  {DIMENSION_LABELS[g]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={styles.toggle}
            aria-pressed={state.compare}
            disabled={!canCompare(state.by)}
            title={canCompare(state.by) ? undefined : "Group by genre, format or publisher to compare quarters"}
            onClick={() => onCompare(!state.compare)}
          >
            Compare quarters
          </button>
          <button
            type="button"
            className={styles.toggle}
            aria-pressed={table}
            onClick={() => {
              setTable(!table);
              onTable(!table);
            }}
          >
            Table
          </button>
        </div>
      </header>

      {table ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                {result.columns.map((c) => (
                  <th key={c.key} scope="col" className={c.type === "number" ? styles.numeric : undefined}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, i) => (
                <tr key={i}>
                  {result.columns.map((c) => (
                    <td key={c.key} className={c.type === "number" ? styles.numeric : undefined}>
                      {c.type === "number"
                        ? formatMeasure(state.measure, row[c.key as ChartMeasure])
                        : formatDimensionValue(c.key as Grouping, row[c.key as Grouping])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          {state.compare && (
            <ul className={styles.legend} aria-label="Quarters">
              {quarters
                .filter((q) => model.series.some((s) => s.quarter === q))
                .map((q) => (
                  <li key={q}>
                    <span className={styles.legendSwatch} style={{ background: quarterColor(q, quarters) }} />
                    {formatDimensionValue("quarter", q)}
                  </li>
                ))}
            </ul>
          )}
          <EChart
            option={option}
            height={barHeight(model)}
            label={`${title}. Click a bar to filter the screen to it.`}
            onCategoryClick={drillAt}
            categoryAxis={model.horizontal ? "y" : "x"}
          />
        </>
      )}

      {!table && model.horizontal && model.ranked > TOP_RANKED && (
        <button type="button" className={styles.showAll} onClick={() => setShowAll(!showAll)}>
          {showAll ? `Show the top ${TOP_RANKED}` : `Show all ${model.ranked} titles`}
        </button>
      )}
      <p className={styles.source}>
        {selected.length > 0
          ? `Filtered to ${selected.map((v) => formatDimensionValue(state.by, v)).join(", ")}. Click a highlighted bar again to clear it. `
          : "Click a bar to filter the screen to it. "}
        Source: {result.source}
      </p>
    </section>
  );
}
