import { useEffect, useMemo, useState } from "react";

import { combineComparison, comparisonQueries } from "~/assistant/tools/comparison";
import type { ComparisonResult } from "~/assistant/tools/definitions";
import type { Dimension, QueryResult } from "~/query/types";
import { Icon } from "~/shell/icons";
import {
  categoryHeight,
  categoryModel,
  categoryOption,
  legendItems,
  nothingToDraw,
} from "../charts/category-chart";
import { measuresModel, measuresOption, measuresTable } from "../charts/measures-chart";
import type { ChartMeasure, Filters, HeatDimension } from "../state";
import { heatAxis, heatModel } from "../charts/heat-model";
import { HeatGrid, HeatScale } from "../Heatmap";
import { MAX_SERIES } from "~/platform/charts/chart-theme";
import { EChart } from "~/platform/charts/EChart";
import { Legend } from "../charts/Legend";
import { ResultTable } from "../charts/ResultTable";
import { formatDimensionValue, formatMeasure, MEASURE_LABELS } from "../format";
import { monthsInScope } from "../state";
import styles from "../Investigate.module.css";
import { fetchQuery, QueryRequestError } from "./query-client";
import type { ChartPinSpec, ComparisonPinSpec, Pin } from "./spec";

const CHART_HEIGHT = 240;

export interface PinnedChartsProps {
  pins: Pin[];
  quarters: readonly string[];
  onRemove: (id: string) => void;
  onError: (code: string) => void;
}

/** The player's board: charts they pinned, or asked Dewey to pin. */
export function PinnedCharts({ pins, quarters, onRemove, onError }: PinnedChartsProps) {
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
  | { kind: "comparison"; result: ComparisonResult };
type Load =
  { status: "loading" } | ({ status: "ready" } & Loaded) | { status: "failed"; message: string };

/**
 * Runs a pin through POST /api/query, as the player's own queries run: nothing Dewey showed is kept or replayed.
 * A comparison is its two queries, combined as Dewey's tool server combines them; if either side fails, the
 * whole card fails, and the other side is cancelled.
 */
export async function runPin(pin: Pin, signal: AbortSignal): Promise<Loaded> {
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
}: {
  pin: Pin;
  quarters: readonly string[];
  onRemove: () => void;
  onError: (code: string) => void;
}) {
  const [load, setLoad] = useState<Load>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setLoad({ status: "loading" });
    runPin(pin, controller.signal)
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
    // A pin's query never changes; a new query is a new pin.
  }, [pin.id]);

  return (
    <article className={`${styles.card} ${styles.pinCard}`} aria-label={pin.title}>
      <header className={styles.pinHeader}>
        <div>
          <h3 className={styles.pinTitle}>{pin.title}</h3>
          <div className={styles.pinMeta}>
            {pin.pinnedBy === "dewey" ? "Pinned by Dewey" : "Pinned by you"}
          </div>
        </div>
        <button
          type="button"
          className={styles.chipRemove}
          aria-label={`Unpin ${pin.title}`}
          title="Unpin"
          onClick={onRemove}
        >
          <Icon name="close" size={14} />
        </button>
      </header>
      {load.status === "loading" && (
        <div className={styles.pinPlaceholder} style={{ height: CHART_HEIGHT }} aria-busy="true" />
      )}
      {load.status === "failed" && (
        <p className={styles.pinError} style={{ minHeight: CHART_HEIGHT }}>
          {load.message}
        </p>
      )}
      {load.status === "ready" &&
        (pin.kind === "comparison"
          ? load.kind === "comparison" && <ComparisonBody pin={pin} result={load.result} />
          : load.kind === "query" &&
            (pin.kind === "heatmap" ? (
              <HeatPinBody pin={pin} result={load.result} quarters={quarters} />
            ) : (
              <PinBody pin={pin} result={load.result} also={load.also} quarters={quarters} />
            )))}
    </article>
  );
}

/** A pinned heatmap: the grid as Investigate draws it, without cells to click. */
function HeatPinBody({
  pin,
  result,
  quarters,
}: {
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
      {result.rows.length === 0 ||
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
}: {
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
  const option = useMemo(
    () =>
      model && (pin.kind === "bar" || pin.kind === "line")
        ? categoryOption(model, { kind: pin.kind, quarters, drill: false })
        : null,
    [model, pin.kind, quarters],
  );

  let body;
  if (
    x &&
    pin.kind !== "table" &&
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
    body =
      pin.kind === "table" ? (
        <ResultTable result={measuresTable(many, [result, ...also])} height={CHART_HEIGHT} />
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
  } else if (pin.kind === "table" || !model || !option || model.series.length > MAX_SERIES) {
    // Past the palette's series, a table reads better than generated colors.
    body = <ResultTable result={result} height={CHART_HEIGHT} />;
  } else {
    body = (
      <>
        <Legend items={legendItems(model, quarters)} label="Series" />
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
