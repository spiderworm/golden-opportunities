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
import { LastYearTable, ResultTable, ShareTable } from "../charts/ResultTable";
import { cutNote, headline, shareHeight, shareModel, shareOption } from "../charts/share-chart";
import {
  changeLine,
  ghostBasedOn,
  ghostNoisy,
  lastYearLabels,
  withLastYear,
} from "../charts/last-year";
import { withNoise } from "../charts/evidence";
import {
  formatDimensionValue,
  formatMeasure,
  MEASURE_LABELS,
  RELATIVE_NAMES,
  relativeReason,
} from "../format";
import { isRelativeQuarter, type RelativeQuarter } from "~/query/relative";
import { eventsCaption, markersFor, withMarkers } from "../charts/event-markers";
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
import { segmented } from "~/segments/apply";
import { SEGMENT_COPY } from "~/segments/copy";
import type { Segment } from "~/segments/segments";

const CHART_HEIGHT = 240;

export interface PinnedChartsProps {
  pins: Pin[];
  quarters: readonly string[];
  /** The player's saved segments now, for the pins that carry one (src/segments/apply.ts). */
  segments: readonly Segment[];
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
  segments,
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
                segments={segments}
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
  | { kind: "waterfall"; rows: DroveRows; resolved?: NonNullable<QueryResult["resolved"]> };
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
    // Made on Latest quarter, its quarters are the ones the server resolved them to now (Plot, #379).
    const resolved = { ...nowRows.revenue.resolved, ...thenRows.revenue.resolved };
    const dated = (quarter: string) =>
      (isRelativeQuarter(quarter) ? resolved[quarter] : quarter) ?? quarter;
    return {
      kind: "waterfall",
      rows: { then: dated(w.then), now: dated(w.now), thenRows, nowRows },
      ...(Object.keys(resolved).length ? { resolved } : {}),
    };
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
  segments,
  onRemove,
  onError,
  addToReport,
  onTable,
}: {
  pin: Pin;
  quarters: readonly string[];
  segments: readonly Segment[];
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
      <PinChart
        spec={pin}
        quarters={quarters}
        segments={segments}
        onError={onError}
        onTooMany={setTooMany}
      />
    </article>
  );
}

interface PinChartProps {
  spec: PinSpec;
  quarters: readonly string[];
  onError: (code: string) => void;
  /** Chart or table, if the place showing it decides; else the spec's own (shownAsTable). */
  table?: boolean;
  /** Told the number of groups when there are too many to chart, so the toggle can say so; null when not. */
  onTooMany?: (groups: number | null) => void;
}

/**
 * A pin's chart, run again through POST /api/query whenever it's shown: on the board, and in a report, which holds a
 * copy of the pin (reports.md section 3). Nothing a chart showed is kept. With its segment's filters, if it carries
 * one, and the report's segment, if it has one (src/segments/apply.ts), saying so under the title (Plot, section 8).
 */
export function PinChart({
  segments = [],
  reportSegment = null,
  ...props
}: PinChartProps & {
  /** The player's saved segments now. */
  segments?: readonly Segment[];
  /** The report's own segment, over every chart in it. */
  reportSegment?: Segment | null;
}) {
  const { spec, quarters } = props;
  const run = segmented(spec, segments, quarters, reportSegment);
  const { onTooMany } = props;
  // Nothing drawn, so nothing too many to chart.
  useEffect(() => {
    if (!run.spec) onTooMany?.(null);
  }, [run.spec === null]);
  return (
    <>
      {run.segment === "deleted" ? (
        <p className={styles.pinMeta}>{SEGMENT_COPY.deleted}</p>
      ) : (
        run.segment && <p className={styles.pinMeta}>{SEGMENT_COPY.onChart(run.segment.name)}</p>
      )}
      {run.spec ? (
        <RunPinChart {...props} spec={run.spec} />
      ) : (
        <p className={styles.pinError} style={{ minHeight: CHART_HEIGHT }}>
          {SEGMENT_COPY.nothingMatches(run.empty!.name)}
        </p>
      )}
    </>
  );
}

function RunPinChart({ spec, quarters, onError, onTooMany, table: asked }: PinChartProps) {
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

  const outOfLedgers = waterfallOutOfLedgers(spec, quarters);
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
      {/* A relative quarter, as the quarter it is now: "Latest quarter: Q1 2194" (Plot, section 9). */}
      {load.status === "ready" && load.kind === "query" && load.result.resolved && (
        <p className={styles.pinMeta}>{resolvedLine(load.result.resolved)}</p>
      )}
      {load.status === "ready" && load.kind === "waterfall" && load.resolved && !outOfLedgers && (
        <p className={styles.pinMeta}>{resolvedLine(load.resolved)}</p>
      )}
      {load.status === "ready" && outOfLedgers && (
        <p className={styles.pinError} style={{ minHeight: CHART_HEIGHT }}>
          {outOfLedgers}
        </p>
      )}
      {load.status === "ready" &&
        spec.kind === "waterfall" &&
        load.kind === "waterfall" &&
        !outOfLedgers && <WaterfallPinBody spec={spec} rows={load.rows} table={table} />}
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
  // As shares, as the main chart showed them (req_fa2e6a0dbbec): of the result's own total.
  const shares = useMemo(
    () =>
      pin.share && model && !seriesBy && !also.length
        ? shareModel(model, result.total, {
            running: pin.share === "running",
            truncated: result.truncated,
          })
        : null,
    [pin.share, model, seriesBy, also.length, result],
  );

  // The result's events on a time axis, as the main chart marks them (src/query/events.ts).
  const marked = useMemo(() => {
    if (!model || !result.events || (model.x !== "month" && model.x !== "quarter")) return null;
    // The categories as drawn: % of total's, in its own order, or the chart's.
    const { markers } = markersFor(
      result.events.list,
      model.x,
      shares ? shares.categories : model.categories,
    );
    // Only the result's cap hides events from the caption's count: one off the axis is outside what the chart
    // shows, and isn't mentioned (Plot, #357).
    return { markers, hidden: result.events.hidden };
  }, [model, shares, result.events]);
  const markedOption = useMemo(
    () => (option && marked ? withMarkers(option, marked.markers) : option),
    [option, marked],
  );
  const eventsNotes = marked ? eventsCaption(marked.markers, marked.hidden) : [];

  const shareChart = useMemo(
    () =>
      shares && !table
        ? marked
          ? withMarkers(shareOption(shares, { drill: false }), marked.markers)
          : shareOption(shares, { drill: false })
        : null,
    [shares, table, marked],
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
  } else if (shares) {
    const top = headline(shares);
    body = table ? (
      <ShareTable
        result={result}
        by={x}
        measure={pin.query.measure}
        running={pin.share === "running"}
      />
    ) : (
      <>
        {top && <p className={styles.shareHeadline}>{top}</p>}
        <EChart
          option={shareChart!}
          height={shareHeight(shares, CHART_HEIGHT)}
          label={top ? `${pin.title}. ${top}` : pin.title}
        />
        {eventsNotes.map((note) => (
          <p key={note} className={styles.tableNote}>
            {note}
          </p>
        ))}
      </>
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
        <EChart
          option={markedOption!}
          height={categoryHeight(model, CHART_HEIGHT)}
          label={pin.title}
        />
        {eventsNotes.map((note) => (
          <p key={note} className={styles.tableNote}>
            {note}
          </p>
        ))}
      </>
    );
  }

  return (
    <>
      {body}
      <p className={styles.source}>
        Source: {result.source}
        {shares && cutNote(shares) ? ` ${cutNote(shares)}` : ""}
      </p>
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

/**
 * Why a waterfall made on Latest quarter can't be drawn now, in Plot's words, or null: pins outlive Play again, so on
 * a fresh save its year earlier may be before the ledgers, and it would draw a change from nothing (Chart, #380).
 */
export function waterfallOutOfLedgers(spec: PinSpec, quarters: readonly string[]): string | null {
  if (spec.kind !== "waterfall") return null;
  const { then, now } = spec.waterfall;
  for (const quarter of [now, then])
    if (isRelativeQuarter(quarter)) {
      const reason = relativeReason(quarter, quarters);
      if (reason) return reason;
    }
  return null;
}

/** What each relative quarter in a pin's filter is now, as Plot words it: `Latest quarter: Q1 2194`. */
export function resolvedLine(resolved: NonNullable<QueryResult["resolved"]>): string {
  return (Object.entries(resolved) as [RelativeQuarter, string | null][])
    .map(([token, quarter]) =>
      quarter
        ? `${RELATIVE_NAMES[token]}: ${formatDimensionValue("quarter", quarter)}`
        : RELATIVE_NAMES[token],
    )
    .join(" · ");
}
