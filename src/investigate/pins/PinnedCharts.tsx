import { useEffect, useMemo, useState, type ReactNode } from "react";

import { combineComparison, comparisonQueries } from "~/assistant/tools/comparison";
import type { ComparisonResult } from "~/assistant/tools/definitions";
import type { Dimension, Query, QueryResult } from "~/query/types";
import { droveQuery, waterfall, type DroveRows, type PeriodRows } from "~/query/decompose";
import { Waterfall } from "../charts/Waterfall";
import { droveLabels } from "../charts/waterfall-chart";
import { Icon } from "~/shell/icons";
import {
  categoryHeight,
  categoryModel,
  categoryOption,
  GHOST_OPACITY,
  legendItems,
  nothingToDraw,
} from "../charts/category-chart";
import { measuresModel, measuresOption, measuresTable } from "../charts/measures-chart";
import { scatterOption } from "../charts/scatter-chart";
import type { ChartMeasure, Filters, HeatDimension } from "../state";
import { heatAxis, heatModel } from "../charts/heat-model";
import { HeatGrid, HeatScale } from "../Heatmap";
import { MAX_SERIES, seriesColor } from "~/platform/charts/chart-theme";
import { EChart } from "~/platform/charts/EChart";
import { EvidenceLegend, Legend } from "../charts/Legend";
import { LastYearTable, ResultTable } from "../charts/ResultTable";
import {
  changeLine,
  ghostBasedOn,
  ghostNoisy,
  lastYearLabels,
  withLastYear,
} from "../charts/last-year";
import { withNoise } from "../charts/evidence";
import { formatDimensionValue, formatMeasure, MEASURE_LABELS } from "../format";
import { monthsInScope } from "../state";
import styles from "../Investigate.module.css";
import { fetchQuery, QueryRequestError } from "./query-client";
import {
  drawnKind,
  noChart,
  pinKey,
  shownAsTable,
  type ChartPinSpec,
  type ComparisonPinSpec,
  type Pin,
  type PinSpec,
  type WaterfallPinSpec,
} from "./spec";
import { noChartReason, TableToggle } from "~/platform/ui/TableToggle";

const CHART_HEIGHT = 240;

export interface PinnedChartsProps {
  pins: Pin[];
  quarters: readonly string[];
  onRemove: (id: string) => void;
  onError: (code: string) => void;
  /** Each pin's Add to report control (reports.md section 3), if the page offers one. */
  addToReport?: (pin: Pin) => ReactNode;
  /** A pin toggled between its chart and its table: the board keeps the view (usePins.setTable). */
  onTable?: (pin: Pin, table: boolean) => void;
}

/** The player's board: charts they pinned, or asked Dewey to pin. */
export function PinnedCharts({
  pins,
  quarters,
  onRemove,
  onError,
  addToReport,
  onTable,
}: PinnedChartsProps) {
  return (
    <section className={styles.pinned} aria-labelledby="pinned-title">
      <header className={styles.pinnedHeader}>
        <h2 id="pinned-title" className={styles.cardTitle}>
          Pinned charts
        </h2>
        {pins.length > 0 && <span className={styles.pinnedCount}>{pins.length}</span>}
      </header>
      {pins.length === 0 ? (
        <p className={styles.pinnedEmpty}>
          Pin a chart to keep it here: use Pin on the chart above or on a table Dewey shows, or ask
          Dewey to pin one.
        </p>
      ) : (
        <ul className={styles.pinnedGrid}>
          {pins.map((pin) => (
            <li key={pin.id}>
              <PinnedChart
                pin={pin}
                quarters={quarters}
                onRemove={() => onRemove(pin.id)}
                onError={onError}
                addToReport={addToReport?.(pin)}
                onTable={onTable && ((table) => onTable(pin, table))}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type Loaded =
  | { kind: "query"; result: QueryResult; also: QueryResult[] }
  | { kind: "comparison"; result: ComparisonResult }
  | { kind: "waterfall"; rows: DroveRows };
type Load =
  { status: "loading" } | ({ status: "ready" } & Loaded) | { status: "failed"; message: string };

/**
 * Runs a pin through POST /api/query, as the player's own queries run: nothing Dewey showed is kept or replayed.
 * A comparison is its two queries, combined as Dewey's tool server combines them; if either side fails, the
 * whole card fails, and the other side is cancelled.
 */
export async function runPin(pin: PinSpec, signal: AbortSignal): Promise<Loaded> {
  if (pin.kind === "waterfall") {
    // Each quarter's revenue (and units, split), as Investigate's loader runs them. Context, not discovery evidence:
    // only the groups drawn as their own bars may count, and a request can't be cut to those before it's recorded;
    // the waterfall shown on Investigate already recorded them (Plot, #335).
    const w = pin.waterfall;
    const query = (measure: "revenue" | "units", quarter: string) =>
      droveQuery(w.by, w.filter, quarter, measure);
    const period = async (quarter: string): Promise<PeriodRows> => {
      const [revenue, units] = await Promise.all([
        fetchQuery(query("revenue", quarter), signal, { evidence: false }),
        w.split ? fetchQuery(query("units", quarter), signal, { evidence: false }) : undefined,
      ]);
      return { revenue, ...(units ? { units } : {}) };
    };
    const [thenRows, nowRows] = await Promise.all([period(w.then), period(w.now)]);
    return { kind: "waterfall", rows: { then: w.then, now: w.now, thenRows, nowRows } };
  }
  if (pin.kind !== "comparison") {
    // Several measures are a query each, as the main chart's.
    // A heatmap is context, never discovery evidence, pinned or not (Plot, #63 and #266): asked without recording.
    const evidence = pin.kind !== "heatmap";
    const [result, ...also] = await Promise.all(
      [pin.query.measure, ...(pin.also ?? [])].map((measure) =>
        fetchQuery({ ...pin.query, measure }, signal, { evidence }),
      ),
    );
    return { kind: "query", result: result!, also };
  }
  const sides = new AbortController();
  const stop = () => sides.abort();
  signal.addEventListener("abort", stop);
  try {
    const [from, to] = await Promise.all(
      comparisonQueries(pin.comparison).map((query) =>
        fetchQuery(query, sides.signal).catch((error: unknown) => {
          sides.abort();
          throw error;
        }),
      ),
    );
    return { kind: "comparison", result: combineComparison(pin.comparison, from!, to!) };
  } finally {
    signal.removeEventListener("abort", stop);
  }
}

function PinnedChart({
  pin,
  quarters,
  onRemove,
  onError,
  addToReport,
  onTable,
}: {
  pin: Pin;
  quarters: readonly string[];
  onRemove: () => void;
  onError: (code: string) => void;
  addToReport?: ReactNode;
  onTable?: (table: boolean) => void;
}) {
  // Why it can't be a chart: known from the spec, or once it's run, too many groups for the palette.
  const [tooMany, setTooMany] = useState<number | null>(null);
  const why = noChartReason(noChart(pin), tooMany, MAX_SERIES);
  return (
    <article className={`${styles.card} ${styles.pinCard}`} aria-label={pin.title}>
      <header className={styles.pinHeader}>
        <div>
          <h3 className={styles.pinTitle}>{pin.title}</h3>
          <div className={styles.pinMeta}>
            {pin.pinnedBy === "dewey" ? "Pinned by Dewey" : "Pinned by you"}
          </div>
        </div>
        <div className={styles.pinActions}>
          {onTable && (
            <TableToggle
              className={styles.toggle}
              table={why !== null || (pin.kind !== "comparison" && shownAsTable(pin))}
              onChange={onTable}
              label={pin.title}
              disabledReason={why}
            />
          )}
          {addToReport}
          <button
            type="button"
            className={styles.chipRemove}
            aria-label={`Unpin ${pin.title}`}
            title="Unpin"
            onClick={onRemove}
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      </header>
      <PinChart spec={pin} quarters={quarters} onError={onError} onTooMany={setTooMany} />
    </article>
  );
}

/**
 * A pin's chart, run again through POST /api/query whenever it's shown: on the board, and in a report, which holds a
 * copy of the pin (reports.md section 3). Nothing a chart showed is kept.
 */
export function PinChart({
  spec,
  quarters,
  onError,
  onTooMany,
  table: asked,
}: {
  spec: PinSpec;
  quarters: readonly string[];
  onError: (code: string) => void;
  /** Chart or table, if the place showing it decides; else the spec's own (shownAsTable). */
  table?: boolean;
  /** Told the number of groups when there are too many to chart, so the toggle can say so; null when not. */
  onTooMany?: (groups: number | null) => void;
}) {
  const table = spec.kind !== "comparison" && (asked ?? shownAsTable(spec));
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const key = pinKey(spec);

  useEffect(() => {
    const controller = new AbortController();
    setLoad({ status: "loading" });
    runPin(spec, controller.signal)
      .then((loaded) => setLoad({ status: "ready", ...loaded }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const code = error instanceof QueryRequestError ? error.code : "NETWORK";
        onError(code);
        setLoad({
          status: "failed",
          message:
            error instanceof QueryRequestError ? error.message : "The data terminal didn't answer.",
        });
      });
    return () => controller.abort();
    // A spec's query never changes for a key; a new query is a new key.
  }, [key]);

  return (
    <>
      {load.status === "loading" && (
        <div className={styles.pinPlaceholder} style={{ height: CHART_HEIGHT }} aria-busy="true" />
      )}
      {load.status === "failed" && (
        <p className={styles.pinError} style={{ minHeight: CHART_HEIGHT }}>
          {load.message}
        </p>
      )}
      {load.status === "ready" && spec.kind === "waterfall" && load.kind === "waterfall" && (
        <WaterfallPinBody spec={spec} rows={load.rows} table={table} />
      )}
      {load.status === "ready" &&
        spec.kind !== "waterfall" &&
        (spec.kind === "comparison"
          ? load.kind === "comparison" && <ComparisonBody pin={spec} result={load.result} />
          : load.kind === "query" &&
            (spec.kind === "heatmap" ? (
              <HeatPinBody pin={spec} result={load.result} quarters={quarters} table={table} />
            ) : (
              <PinBody
                pin={spec}
                result={load.result}
                also={load.also}
                quarters={quarters}
                table={table}
                onTooMany={onTooMany}
              />
            )))}
    </>
  );
}

/** A pinned heatmap: the grid as Investigate draws it, without cells to click. */
function HeatPinBody({
  pin,
  result,
  quarters,
  table,
}: {
  /** Read as its rows instead of the grid. */
  table: boolean;
  pin: ChartPinSpec;
  result: QueryResult;
  quarters: readonly string[];
}) {
  const [rows, cols] = pin.query.by as [HeatDimension, HeatDimension];
  const measure = pin.query.measure as ChartMeasure;
  const filters = (pin.query.filter ?? {}) as Filters;
  const model = useMemo(
    () =>
      heatModel(
        result,
        measure,
        rows,
        heatAxis(rows, result, quarters, filters),
        cols,
        heatAxis(cols, result, quarters, filters),
      ),
    [result, measure, rows, cols, quarters, pin],
  );
  return (
    <>
      {table ? (
        <ResultTable result={result} height={CHART_HEIGHT} />
      ) : result.rows.length === 0 ||
        nothingToDraw([{ values: model.cells.map((c) => c[2]) }], [measure]) ? (
        <p className={styles.pinError} style={{ minHeight: CHART_HEIGHT }}>
          No sales match this chart.
        </p>
      ) : (
        <>
          <HeatScale measure={measure} model={model} />
          <HeatGrid model={model} measure={measure} rowsBy={rows} colsBy={cols} label={pin.title} />
        </>
      )}
      <p className={styles.source}>{`Source: ${result.source}`}</p>
    </>
  );
}

function PinBody({
  pin,
  result,
  also,
  quarters,
  table,
  onTooMany,
}: {
  table: boolean;
  onTooMany?: (groups: number | null) => void;
  pin: ChartPinSpec;
  result: QueryResult;
  also: readonly QueryResult[];
  quarters: readonly string[];
}) {
  const [x, seriesBy = null] = pin.query.by;
  const measures = [pin.query.measure, ...(pin.also ?? [])] as ChartMeasure[];
  const many = useMemo(
    () =>
      x && also.length && !seriesBy
        ? measuresModel(
            [result, ...also],
            measures,
            x,
            x === "month" ? pinMonths(pin, quarters) : [],
          )
        : null,
    [result, also, x, seriesBy, quarters, pin],
  );
  const model = useMemo(
    () =>
      x
        ? categoryModel(result, x, seriesBy, x === "month" ? pinMonths(pin, quarters) : [], {
            limit: pin.query.limit,
          })
        : null,
    [result, x, seriesBy, quarters, pin],
  );
  // Pinned with last year beside it (Frank's #301): this year's quarter, the one the pin's quarter filter picks, and
  // the same quarter a year before, drawn and tabled as the main chart draws them.
  const quarter = pin.query.vs === "last_year" ? pin.query.filter?.quarter?.[0] : undefined;
  const labels =
    quarter && x && !seriesBy && !also.length && result.lastYear
      ? lastYearLabels(quarter, x)
      : null;
  const ghost = useMemo(
    () => (labels && model ? withLastYear(model, result, labels) : null),
    [model, result, labels?.quarter],
  );
  const option = useMemo(
    () =>
      model && !table
        ? ghost
          ? categoryOption(ghost, {
              kind: drawnKind(pin),
              quarters,
              drill: false,
              // As the main chart's tooltip (#311, #322): the change marked when it's within noise, and both years'
              // counts behind an average (Frank, #325).
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
          : categoryOption(model, { kind: drawnKind(pin), quarters, drill: false })
        : null,
    [model, ghost, table, pin.kind, quarters],
  );

  // Past the palette's series it reads as a table whatever the toggle says, and the toggle says why.
  const groups = !many && model && model.series.length > MAX_SERIES ? model.series.length : null;
  useEffect(() => onTooMany?.(groups), [groups]);

  let body;
  if (
    x &&
    !table &&
    (result.rows.length === 0 ||
      (many
        ? nothingToDraw(
            many.measures,
            many.measures.map((m) => m.measure),
          )
        : nothingToDraw(model?.series ?? [], [pin.query.measure])))
  ) {
    body = (
      <p className={styles.pinError} style={{ minHeight: CHART_HEIGHT }}>
        No sales match this chart.
      </p>
    );
  } else if (many) {
    body = table ? (
      <ResultTable result={measuresTable(many, [result, ...also])} height={CHART_HEIGHT} />
    ) : pin.kind === "scatter" ? (
      <EChart option={scatterOption(many)} height={CHART_HEIGHT} label={pin.title} />
    ) : (
      <>
        <Legend
          items={many.measures.map((m) => ({ label: MEASURE_LABELS[m.measure], color: m.color }))}
          label="Measures"
        />
        <EChart
          option={measuresOption(many)}
          height={categoryHeight(
            { ...model!, categories: many.categories, horizontal: many.horizontal },
            CHART_HEIGHT,
          )}
          label={pin.title}
        />
      </>
    );
  } else if (!x) {
    // One number is a figure, not a one-bar chart.
    body = (
      <div className={styles.pinFigure} style={{ height: CHART_HEIGHT }}>
        <span className={styles.tileValue}>{formatMeasure(pin.query.measure, result.total)}</span>
        <span className={styles.pinMeta}>{MEASURE_LABELS[pin.query.measure]}</span>
      </div>
    );
  } else if (table && labels) {
    body = <LastYearTable result={result} by={x} measure={pin.query.measure} labels={labels} />;
  } else if (table || !model || !option || model.series.length > MAX_SERIES) {
    // Past the palette's series, a table reads better than generated colors.
    body = <ResultTable result={result} height={CHART_HEIGHT} />;
  } else {
    body = (
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
          label={ghost ? "Quarters" : "Series"}
        />
        <EvidenceLegend model={model} />
        <EChart option={option} height={categoryHeight(model, CHART_HEIGHT)} label={pin.title} />
      </>
    );
  }

  return (
    <>
      {body}
      <p className={styles.source}>Source: {result.source}</p>
    </>
  );
}

const percent = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
  signDisplay: "exceptZero",
});

/** A pinned comparison: each breakdown row, then the overall figures, as Dewey showed them. */
function ComparisonBody({ pin, result }: { pin: ComparisonPinSpec; result: ComparisonResult }) {
  const { measure } = pin.comparison;
  // The overall figures go last, as in Dewey's panel; its breakdown cell reads "All".
  const rows: Record<string, unknown>[] = [...result.rows, { ...result.total }];
  const cell = (key: string, value: unknown, total: boolean) => {
    if (key === "percent_change")
      return typeof value === "number" ? `${percent.format(value)}%` : "No data";
    if (key === "from" || key === "to" || key === "change")
      return formatMeasure(measure, typeof value === "number" ? value : null);
    return total ? "All" : formatDimensionValue(key as Dimension, value as string | null);
  };
  return (
    <>
      <div className={styles.tableWrap} style={{ height: CHART_HEIGHT }}>
        <table className={styles.table}>
          <thead>
            <tr>
              {result.columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={c.type === "number" ? styles.numeric : undefined}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {result.columns.map((c) => (
                  <td key={c.key} className={c.type === "number" ? styles.numeric : undefined}>
                    {cell(c.key, row[c.key], i === result.rows.length)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.source}>Source: {result.source}</p>
    </>
  );
}

/** The months a pin's month axis covers: those in its quarters, narrowed by its own month filter. */
export function pinMonths(pin: ChartPinSpec, quarters: readonly string[]): string[] {
  const months = monthsInScope(quarters, pin.query.filter?.quarter);
  const only = pin.query.filter?.month;
  return only ? months.filter((m) => only.includes(m)) : months;
}

/** A pinned waterfall: the same chart and table What drove the change draws on Investigate. */
function WaterfallPinBody({
  spec,
  rows,
  table,
}: {
  spec: WaterfallPinSpec;
  rows: DroveRows;
  table: boolean;
}) {
  const w = spec.waterfall;
  const model = useMemo(
    () => waterfall(w.by, rows.thenRows, rows.nowRows, { split: !!w.split }),
    [rows, w.by, w.split],
  );
  const labels = useMemo(() => droveLabels(rows.then, rows.now), [rows]);
  const split = !!model.split && !("problem" in model.split);
  return (
    <>
      <Waterfall
        model={model}
        labels={labels}
        split={split}
        table={table}
        title={spec.title}
        narrow
      />
      {/* Each quarter's own query, as the waterfall on Investigate says (Chart, #339). */}
      <p className={styles.source}>
        Source: {labels.then}: {rows.thenRows.revenue.source} {labels.now}:{" "}
        {rows.nowRows.revenue.source}
      </p>
    </>
  );
}
