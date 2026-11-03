import { useEffect, useMemo, useState } from "react";

import type { QueryResult } from "~/query/types";
import { Icon } from "~/shell/icons";
import { track } from "~/platform/analytics/analytics.client";
import {
  categoryHeight,
  categoryModel,
  categoryOption,
  GHOST_OPACITY,
  legendItems,
  noiseFlags,
  nothingToDraw,
  TOP_RANKED,
  type CategoryModel,
} from "./charts/category-chart";
import { EChart } from "~/platform/charts/EChart";
import { waterfall, type DroveRows } from "~/query/decompose";
import { Waterfall } from "./charts/Waterfall";
import { droveLabels } from "./charts/waterfall-chart";
import { Dropdown, ToggleMenu } from "~/platform/ui/Dropdown";
import { EvidenceLegend, Legend } from "./charts/Legend";
import { SCATTER_HEIGHT, scatterOption, scatterPoints, scatterTitle } from "./charts/scatter-chart";
import { LastYearTable, ResultTable } from "./charts/ResultTable";
import {
  changeLine,
  ghostBasedOn,
  ghostNoisy,
  lastYearLabels,
  withLastYear,
} from "./charts/last-year";
import { lastYearNoise, withNoise } from "./charts/evidence";
import { seriesColor } from "~/platform/charts/chart-theme";
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
  lastYearBlock,
  lastYearUnshown,
  measuresOf,
  monthsInScope,
  scatterProblem,
  shownQuarter,
  droveBlock,
  droveGroups,
  droveOn,
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
  /** The scatter plot turned on or off (scatterProblem says when it can be on). */
  onScatter: (on: boolean) => void;
  /** "vs. same quarter last year" switched on or off. */
  onLastYear?: (on: boolean) => void;
  /** "What drove the change": the loader's two quarters' rows, null unless it's on and allowed. */
  drove?: DroveRows | null;
  /** "What drove the change", and its price, volume and mix split, switched on or off. */
  onDrove?: (on: boolean) => void;
  onSplit?: (on: boolean) => void;
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
  onScatter,
  onLastYear,
  drove = null,
  onDrove,
  onSplit,
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
  const waterfallOn = droveOn(state, quarters);
  const noScatter = waterfallOn
    ? "Turn off What drove the change for a scatter plot"
    : scatterProblem(state.by, state.also);
  const scatter = state.scatter && noScatter === null;
  const manyOption = useMemo(
    () =>
      many
        ? scatter
          ? scatterOption(many, { selected })
          : measuresOption(many, { selected, hidden })
        : null,
    [many, scatter, selected.join("\u0000"), hidden.join()],
  );
  const points = useMemo(() => (many && scatter ? scatterPoints(many) : []), [many, scatter]);
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
  // Last year beside this year (Plot, #291): only where it's allowed and the server ran it; else it says why.
  const lastYearReason =
    lastYearBlock(state, quarters) ??
    (state.lastYear
      ? lastYearUnshown(state, result)
      : lastYearUnshown(state, { ...result, lastYear: true }));
  const quarter = shownQuarter(state);
  const labels =
    state.lastYear && !lastYearReason && quarter && result.lastYear
      ? lastYearLabels(quarter, state.by)
      : null;
  const ghost = useMemo(
    () => (labels ? withLastYear(model, result, labels) : null),
    // labels follows state.by too (its legend), and a new grouping rebuilds model, so model covers it.
    [model, result, labels?.quarter],
  );
  // Comparing quarters or last year: say when some differences are within noise, by measure and how many, never
  // which.
  const noiseWhere = labels ? "last_year" : state.compare ? "compare" : null;
  const noise = useMemo(
    () => (labels ? lastYearNoise(result) : noiseFlags(model)),
    [model, result, labels?.quarter],
  );
  useEffect(() => {
    if (noiseWhere && noise.flagged)
      track("investigate_noise_shown", {
        measure: model.measure,
        where: noiseWhere,
        flagged: noise.flagged,
        compared: noise.compared,
      });
  }, [noiseWhere, noise.flagged, noise.compared, model.measure]);
  const option = useMemo(
    () =>
      ghost
        ? categoryOption(ghost, {
            selected,
            quarters,
            ghost: {
              change: (i) => {
                const line = changeLine(
                  model.measure,
                  model.series[0]?.values[i] ?? null,
                  ghost.lastYear[i]!,
                );
                return line && withNoise(line, ghostNoisy(ghost, i));
              },
              basedOn: (i) => (labels ? ghostBasedOn(ghost, i, labels) : null),
            },
          })
        : categoryOption(model, {
            selected,
            quarters,
            share: chartShare(state, model, result.total, quarters),
          }),
    // selected is derived from state.filters, which changes identity with each navigation.
    [model, ghost, selected.join("\u0000"), quarters, state, result.total],
  );
  // What drove the change (Plot, #328): on, allowed, and the loader ran it; else it says why.
  const droveReason =
    droveBlock(state, quarters) ??
    (state.drove
      ? drove
        ? drove.thenRows.revenue.rows.length + drove.nowRows.revenue.rows.length
          ? null
          : `Nothing in ${droveLabels(drove.then, drove.now).now} or ${droveLabels(drove.then, drove.now).then} matches these filters, so there's no change to explain`
        : "Can't break down this chart's change"
      : null);
  const droveWords = droveLabels(drove?.then ?? "", drove?.now ?? "");
  const waterfallModel = useMemo(
    () =>
      state.drove && drove && !droveReason
        ? waterfall(state.by, drove.thenRows, drove.nowRows, { split: state.split })
        : null,
    [drove, state.drove, state.split, state.by, droveReason],
  );
  const splitProblem =
    waterfallModel?.split && "problem" in waterfallModel.split
      ? waterfallModel.split.problem
      : null;
  const splitReason = !waterfallModel
    ? "Turn on What drove the change to split it"
    : splitProblem === "truncated"
      ? `Too many ${droveGroups(state.by)} to split into price, volume and mix: filter to fewer`
      : splitProblem
        ? "Can't split this change into price, volume and mix"
        : null;
  useEffect(() => {
    if (waterfallModel)
      track("investigate_drove_shown", {
        by: state.by,
        split: !!waterfallModel.split && !("problem" in waterfallModel.split),
      });
  }, [waterfallModel]);
  const title = waterfallModel
    ? `What drove revenue's change, ${droveWords.then} to ${droveWords.now}, by ${DIMENSION_LABELS[state.by].toLowerCase()}`
    : scatter
      ? scatterTitle(measures, state.by)
      : `${measuresLabel(measures)} by ${DIMENSION_LABELS[state.by].toLowerCase()}${labels ? `, vs. ${labels.then}` : ""}`;

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
          {/* The chart's modes, in one menu (David, 3 Nov 2026: "Keep the Chart/Table toggle and Pin buttons
              inline. Create an "Options" dropdown"). One that can't be used stays in it, saying why. Plot's order: the
              ways to compare, then (to come) the ways to show one measure, then Scatter plot, which needs two. */}
          <ToggleMenu
            name="Options"
            onOpen={() => track("chart_options_opened", { where: "investigate" })}
            toggles={[
              {
                key: "compare",
                label: "Compare quarters",
                on: state.compare,
                reason: state.also.length
                  ? "Show one measure to compare quarters"
                  : !canCompare(state.by)
                    ? "Group by genre, format or publisher to compare quarters"
                    : waterfallOn
                      ? "Turn off What drove the change to compare quarters"
                      : labels
                        ? "Turn off vs. same quarter last year to compare quarters"
                        : null,
                onToggle: () => onCompare(!state.compare),
              },
              {
                key: "last_year",
                label: "vs. same quarter last year",
                on: labels !== null,
                reason: lastYearReason,
                onToggle: () => onLastYear?.(!state.lastYear),
              },
              {
                key: "drove",
                label: "What drove the change",
                on: waterfallModel !== null,
                reason: droveReason,
                hint: `See which ${droveGroups(state.by) ?? "groups"} added to revenue and which took away`,
                onToggle: () => onDrove?.(!state.drove),
              },
              // Its split, under it, only while it's asked for (Plot).
              ...(state.drove
                ? [
                    {
                      key: "split",
                      label: "Split into price, volume and mix",
                      on: state.split && splitReason === null,
                      reason: splitReason,
                      under: true,
                      onToggle: () => onSplit?.(!state.split),
                    },
                  ]
                : []),
              {
                key: "scatter",
                label: "Scatter plot",
                on: scatter,
                reason: noScatter,
                hint: `Plot one measure against the other, one point per ${DIMENSION_LABELS[state.by].toLowerCase()}`,
                onToggle: () => onScatter(!scatter),
              },
            ]}
          />
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
      ) : waterfallModel ? (
        <Waterfall
          model={waterfallModel}
          labels={droveWords}
          split={state.split && splitReason === null}
          table={table}
          title={title}
        />
      ) : many && manyOption ? (
        table ? (
          <ResultTable result={measuresTable(many, [result, ...also])} />
        ) : scatter ? (
          <EChart
            option={manyOption}
            height={SCATTER_HEIGHT}
            label={`${title}. Click a point to look closer.`}
            onClick={(event) => {
              // Unknown groups can't be filtered on, as with a bar.
              const value = points[event.dataIndex]?.category;
              if (value !== null && value !== undefined) onDrill(value);
            }}
          />
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
        labels ? (
          <LastYearTable result={result} by={state.by} measure={state.measure} labels={labels} />
        ) : (
          <ResultTable result={result} />
        )
      ) : (
        <>
          <Legend
            items={
              ghost && labels
                ? labels.legend.map((label, i) => ({
                    label,
                    color: seriesColor("quarter", ghost.series[0]!.key, 0, quarters),
                    opacity: i === 1 ? GHOST_OPACITY : undefined,
                  }))
                : legendItems(model, quarters)
            }
            label="Quarters"
          />
          <EvidenceLegend model={model} />
          <EChart
            option={option}
            height={categoryHeight(model)}
            label={`${title}. Click to look closer.`}
            onCategoryClick={drillAt}
            categoryAxis={model.horizontal ? "y" : "x"}
          />
        </>
      )}

      {!table && !waterfallModel && model.horizontal && model.ranked > TOP_RANKED && (
        <button type="button" className={styles.showAll} onClick={() => setShowAll(!showAll)}>
          {showAll
            ? `Show the top ${TOP_RANKED}`
            : `Show all ${model.ranked} ${state.by === "edition" ? "editions" : "titles"}`}
        </button>
      )}
      <p className={styles.source}>
        {selected.length > 0
          ? `Filtered to ${selected.map((v) => formatDimensionValue(state.by, v)).join(", ")}. Click a highlighted bar again to clear it. `
          : // The table's rows aren't clickable the way bars are: only the chart says to (Plot).
            result.rows.length > 0 && !table && !waterfallModel
            ? "Click to look closer. "
            : ""}
        {waterfallModel && drove
          ? // The waterfall's own two queries, one per quarter, not the chart's (Chart, #335).
            `Source: ${droveWords.then}: ${drove.thenRows.revenue.source} ${droveWords.now}: ${drove.nowRows.revenue.source}`
          : `Source: ${result.source}`}
      </p>
    </section>
  );
}
