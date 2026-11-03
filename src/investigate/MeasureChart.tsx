import { useEffect, useMemo, useState } from "react";

import type { QueryResult } from "~/query/types";
import { Icon } from "~/shell/icons";
import {
  categoryHeight,
  categoryModel,
  categoryOption,
  legendItems,
  nothingToDraw,
  TOP_RANKED,
  type CategoryModel,
} from "./charts/category-chart";
import { EChart } from "~/platform/charts/EChart";
import { Dropdown } from "~/platform/ui/Dropdown";
import { Legend } from "./charts/Legend";
import { ResultTable } from "./charts/ResultTable";
import {
  measureColor,
  measuresModel,
  measuresOption,
  measuresTable,
} from "./charts/measures-chart";
import {
  ADDITIVE,
  DIMENSION_LABELS,
  formatDimensionValue,
  MEASURE_LABELS,
  measuresLabel,
  periodLabel,
} from "./format";
import {
  canAddMeasure,
  canCompare,
  CHART_MEASURES,
  fittingMeasures,
  GROUPINGS,
  measuresOf,
  monthsInScope,
  type ChartMeasure,
  type Grouping,
  type InvestigateState,
} from "./state";
import styles from "./Investigate.module.css";

export interface MeasureChartProps {
  state: InvestigateState;
  result: QueryResult;
  /** The other measures' results, in the order chosen (state.also). */
  also?: readonly QueryResult[];
  quarters: readonly string[];
  /** The chart's measures, the first one first: one to three, on at most two units. */
  onMeasures: (measures: ChartMeasure[]) => void;
  /** A measure's series turned off or on in the legend. */
  onSeries?: (measure: ChartMeasure, shown: boolean) => void;
  onGroup: (by: Grouping) => void;
  onCompare: (compare: boolean) => void;
  onDrill: (value: string) => void;
  onTable: (shown: boolean) => void;
  /** Pins this view to the pinned charts; `pinned` when an identical one is already there. */
  onPin: () => void;
  pinned: boolean;
}

/**
 * The tooltip's "{share}% of {period}", or undefined to leave it out. Only when
 * the bars are a whole: an additive measure, no filter but the quarter (the
 * chart ignores its own grouping's), and, comparing quarters, a measure whose
 * groups add up to the quarter.
 */
export function chartShare(
  state: InvestigateState,
  model: CategoryModel,
  total: number | null,
  quarters: readonly string[],
) {
  const whole =
    ADDITIVE.includes(state.measure) &&
    Object.entries(state.filters).every(
      ([d, v]) => d === "quarter" || d === state.by || !v?.length,
    );
  if (!whole) return undefined;
  if (model.seriesBy === "quarter") {
    // Each bar against its own quarter, as the sum of its groups. That's the quarter's
    // whole for revenue and units, where each sale is in one group, but not for orders:
    // an order with books in two genres is in both.
    if (state.measure === "orders") return undefined;
    return {
      total: (s: number) =>
        model.series[s]?.values.reduce<number>((t, v) => t + (v ?? 0), 0) ?? null,
      period: (s: number) => formatDimensionValue("quarter", model.series[s]?.key),
    };
  }
  // The period the chart's query covers: grouped by quarter, it ignores the quarter filter too.
  const scope =
    state.by !== "quarter" && state.filters.quarter?.length ? state.filters.quarter : quarters;
  return { total: () => total, period: () => periodLabel(scope) };
}

export function MeasureChart({
  state,
  result,
  also = [],
  quarters,
  onMeasures,
  onSeries,
  onGroup,
  onCompare,
  onDrill,
  onTable,
  onPin,
  pinned,
}: MeasureChartProps) {
  const [table, setTable] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [hidden, setHidden] = useState<ChartMeasure[]>([]);
  const measures = measuresOf(state);
  const several = state.also.length > 0 && also.length === state.also.length;
  const selected = state.filters[state.by] ?? [];
  const months = state.by === "month" ? monthsInScope(quarters, state.filters.quarter) : [];
  const many = useMemo(
    () =>
      several
        ? measuresModel([result, ...also], measures, state.by, months, {
            top: showAll ? undefined : TOP_RANKED,
            keep: selected,
          })
        : null,
    [
      several,
      result,
      also,
      measures.join(),
      state.by,
      months.join(),
      showAll,
      selected.join("\u0000"),
    ],
  );
  const manyOption = useMemo(
    () => (many ? measuresOption(many, { selected, hidden }) : null),
    [many, selected.join("\u0000"), hidden.join()],
  );
  // A measure taken off the chart can't stay hidden.
  useEffect(() => setHidden((h) => h.filter((m) => measures.includes(m))), [measures.join()]);
  const model = useMemo(
    () =>
      categoryModel(result, state.by, state.compare ? "quarter" : null, months, {
        top: showAll ? undefined : TOP_RANKED,
        keep: selected,
      }),
    [result, state.by, state.compare, months.join(), showAll, selected.join("\u0000")],
  );
  const option = useMemo(
    () =>
      categoryOption(model, {
        selected,
        quarters,
        share: chartShare(state, model, result.total, quarters),
      }),
    // selected is derived from state.filters, which changes identity with each navigation.
    [model, selected.join("\u0000"), quarters, state, result.total],
  );
  const title = `${measuresLabel(measures)} by ${DIMENSION_LABELS[state.by].toLowerCase()}`;

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
          <Dropdown
            mode="multi"
            name="Show"
            values={measures}
            // Two quick choices can come before the first one's navigation lands: keep what fits.
            onChange={(next) => next.length > 0 && onMeasures(fittingMeasures(next))}
            options={CHART_MEASURES.map((m) => {
              const on = measures.includes(m);
              const fit = canAddMeasure(measures, m);
              return {
                value: m,
                label: MEASURE_LABELS[m],
                color: on && measures.length > 1 ? measureColor(measures.indexOf(m)) : undefined,
                // Three measures on two units at most (David, 2 Nov 2026); and the chart needs one.
                disabledReason: on
                  ? measures.length === 1
                    ? "The chart needs one"
                    : null
                  : fit === "full"
                    ? "Three at most"
                    : fit === "third unit"
                      ? "Two axes at most"
                      : null,
              };
            })}
          />
          <Dropdown
            mode="single"
            name="Break down by"
            value={state.by}
            onChange={onGroup}
            options={GROUPINGS.map((g) => ({ value: g, label: DIMENSION_LABELS[g] }))}
          />
          <button
            type="button"
            className={styles.toggle}
            aria-pressed={state.compare}
            disabled={!canCompare(state.by, state.also)}
            title={
              state.also.length
                ? "Show one measure to compare quarters"
                : canCompare(state.by)
                  ? undefined
                  : "Group by genre, format or publisher to compare quarters"
            }
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
          <button
            type="button"
            className={styles.toggle}
            onClick={onPin}
            disabled={pinned}
            title={pinned ? "Already pinned" : "Pin this chart below"}
          >
            <Icon name="pin" size={14} /> {pinned ? "Pinned" : "Pin"}
          </button>
        </div>
      </header>

      {result.rows.length === 0 ||
      (!table &&
        (many
          ? nothingToDraw(
              many.measures,
              many.measures.map((m) => m.measure),
            )
          : nothingToDraw(model.series, [model.measure]))) ? (
        <p className={styles.empty}>No sales match these filters.</p>
      ) : many && manyOption ? (
        table ? (
          <ResultTable result={measuresTable(many, [result, ...also])} />
        ) : (
          <>
            <ul className={styles.legend} aria-label="Measures">
              {many.measures.map((m) => {
                const off = hidden.includes(m.measure);
                return (
                  <li key={m.measure}>
                    <button
                      type="button"
                      className={styles.legendToggle}
                      aria-pressed={!off}
                      onClick={() => {
                        setHidden(
                          off ? hidden.filter((h) => h !== m.measure) : [...hidden, m.measure],
                        );
                        onSeries?.(m.measure, off);
                      }}
                    >
                      <span
                        className={styles.legendSwatch}
                        style={{ background: off ? "transparent" : m.color, borderColor: m.color }}
                      />
                      {MEASURE_LABELS[m.measure]}
                    </button>
                  </li>
                );
              })}
            </ul>
            <EChart
              option={manyOption}
              height={categoryHeight({
                ...model,
                categories: many.categories,
                horizontal: many.horizontal,
              })}
              label={`${title}. Click to look closer.`}
              onCategoryClick={drillAt}
              categoryAxis={many.horizontal ? "y" : "x"}
            />
          </>
        )
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
          {showAll
            ? `Show the top ${TOP_RANKED}`
            : `Show all ${model.ranked} ${state.by === "edition" ? "editions" : "titles"}`}
        </button>
      )}
      <p className={styles.source}>
        {selected.length > 0
          ? `Filtered to ${selected.map((v) => formatDimensionValue(state.by, v)).join(", ")}. Click a highlighted bar again to clear it. `
          : result.rows.length > 0
            ? "Click to look closer. "
            : ""}
        Source: {result.source}
      </p>
    </section>
  );
}
