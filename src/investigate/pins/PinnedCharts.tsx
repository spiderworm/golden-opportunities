import { useEffect, useMemo, useState } from "react";

import type { QueryResult } from "~/query/types";
import { Icon } from "~/shell/icons";
import { categoryHeight, categoryModel, categoryOption, legendItems } from "../charts/category-chart";
import { MAX_SERIES } from "../charts/chart-theme";
import { EChart } from "../charts/EChart";
import { Legend } from "../charts/Legend";
import { ResultTable } from "../charts/ResultTable";
import { formatMeasure, MEASURE_LABELS } from "../format";
import { monthsInScope } from "../state";
import styles from "../Investigate.module.css";
import { fetchQuery, QueryRequestError } from "./query-client";
import type { Pin } from "./spec";

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
        <p className={styles.pinnedEmpty}>Pin a chart to keep it here: use Pin on the chart above, or ask Dewey to pin one.</p>
      ) : (
        <ul className={styles.pinnedGrid}>
          {pins.map((pin) => (
            <li key={pin.id}>
              <PinnedChart pin={pin} quarters={quarters} onRemove={() => onRemove(pin.id)} onError={onError} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type Load = { status: "loading" } | { status: "ready"; result: QueryResult } | { status: "failed"; message: string };

function PinnedChart({ pin, quarters, onRemove, onError }: { pin: Pin; quarters: readonly string[]; onRemove: () => void; onError: (code: string) => void }) {
  const [load, setLoad] = useState<Load>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setLoad({ status: "loading" });
    fetchQuery(pin.query, controller.signal)
      .then((result) => setLoad({ status: "ready", result }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const code = error instanceof QueryRequestError ? error.code : "NETWORK";
        onError(code);
        setLoad({ status: "failed", message: error instanceof QueryRequestError ? error.message : "The data terminal didn't answer." });
      });
    return () => controller.abort();
    // A pin's query never changes; a new query is a new pin.
  }, [pin.id]);

  return (
    <article className={`${styles.card} ${styles.pinCard}`} aria-label={pin.title}>
      <header className={styles.pinHeader}>
        <div>
          <h3 className={styles.pinTitle}>{pin.title}</h3>
          <div className={styles.pinMeta}>{pin.pinnedBy === "dewey" ? "Pinned by Dewey" : "Pinned by you"}</div>
        </div>
        <button type="button" className={styles.chipRemove} aria-label={`Unpin ${pin.title}`} title="Unpin" onClick={onRemove}>
          <Icon name="close" size={14} />
        </button>
      </header>
      {load.status === "loading" && <div className={styles.pinPlaceholder} style={{ height: CHART_HEIGHT }} aria-busy="true" />}
      {load.status === "failed" && (
        <p className={styles.pinError} style={{ minHeight: CHART_HEIGHT }}>
          {load.message}
        </p>
      )}
      {load.status === "ready" && <PinBody pin={pin} result={load.result} quarters={quarters} />}
    </article>
  );
}

function PinBody({ pin, result, quarters }: { pin: Pin; result: QueryResult; quarters: readonly string[] }) {
  const [x, seriesBy = null] = pin.query.by;
  const model = useMemo(
    () => (x ? categoryModel(result, x, seriesBy, x === "month" ? pinMonths(pin, quarters) : [], { limit: pin.query.limit }) : null),
    [result, x, seriesBy, quarters, pin],
  );
  const option = useMemo(
    () => (model && pin.kind !== "table" ? categoryOption(model, { kind: pin.kind, quarters, drill: false }) : null),
    [model, pin.kind, quarters],
  );

  let body;
  if (!x) {
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

/** The months a pin's month axis covers: those in its quarters, narrowed by its own month filter. */
export function pinMonths(pin: Pin, quarters: readonly string[]): string[] {
  const months = monthsInScope(quarters, pin.query.filter?.quarter);
  const only = pin.query.filter?.month;
  return only ? months.filter((m) => only.includes(m)) : months;
}
