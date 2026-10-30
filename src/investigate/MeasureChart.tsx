import { useMemo, useState } from "react";

import type { QueryResult } from "~/query/types";
import { Icon } from "~/shell/icons";
import { categoryHeight, categoryModel, categoryOption, legendItems, TOP_RANKED } from "./charts/category-chart";
import { EChart } from "~/platform/charts/EChart";
import { Legend } from "./charts/Legend";
import { ResultTable } from "./charts/ResultTable";
import { ADDITIVE, DIMENSION_LABELS, formatDimensionValue, MEASURE_LABELS, periodLabel } from "./format";
import { canCompare, CHART_MEASURES, GROUPINGS, monthsInScope, type ChartMeasure, type Grouping, type InvestigateState } from "./state";
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
  /** Pins this view to the pinned charts; `pinned` when an identical one is already there. */
  onPin: () => void;
  pinned: boolean;
}

export function MeasureChart({ state, result, quarters, onMeasure, onGroup, onCompare, onDrill, onTable, onPin, pinned }: MeasureChartProps) {
  const [table, setTable] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const selected = state.filters[state.by] ?? [];
  const months = state.by === "month" ? monthsInScope(quarters, state.filters.quarter) : [];
  const model = useMemo(
    () =>
      categoryModel(result, state.by, state.compare ? "quarter" : null, months, { top: showAll ? undefined : TOP_RANKED, keep: selected }),
    [result, state.by, state.compare, months.join(), showAll, selected.join("\u0000")],
  );
  // "{share}% of {period}" only when the bars are the whole period: an additive
  // measure, and no filter but the quarter (the chart ignores its own grouping's).
  const whole = ADDITIVE.includes(state.measure) && Object.entries(state.filters).every(([d, v]) => d === "quarter" || d === state.by || !v?.length);
  const period = periodLabel(state.filters.quarter?.length ? state.filters.quarter : quarters);
  const option = useMemo(
    () =>
      categoryOption(model, {
        selected,
        quarters,
        share: !whole
          ? undefined
          : model.seriesBy === "quarter"
            ? {
                // Comparing quarters: each bar against its own quarter.
                total: (s) => model.series[s]?.values.reduce<number>((t, v) => t + (v ?? 0), 0) ?? null,
                period: (s) => formatDimensionValue("quarter", model.series[s]?.key),
              }
            : { total: () => result.total, period: () => period },
      }),
    // selected is derived from state.filters, which changes identity with each navigation.
    [model, selected.join("\u0000"), quarters, whole, period, result.total],
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
            <span className={styles.selectLabel}>Break down by</span>
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
          <button type="button" className={styles.toggle} onClick={onPin} disabled={pinned} title={pinned ? "Already pinned" : "Pin this chart below"}>
            <Icon name="pin" size={14} /> {pinned ? "Pinned" : "Pin"}
          </button>
        </div>
      </header>

      {result.rows.length === 0 ? (
        <p className={styles.empty}>No sales match these filters.</p>
      ) : table ? (
        <ResultTable result={result} />
      ) : (
        <>
          <Legend items={legendItems(model, quarters)} label="Quarters" />
          <EChart
            option={option}
            height={categoryHeight(model)}
            label={`${title}. Click to look closer.`}
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
          : result.rows.length > 0 ? "Click to look closer. " : ""}
        Source: {result.source}
      </p>
    </section>
  );
}
