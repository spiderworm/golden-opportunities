import type { Dimension, Measure, QueryResult } from "~/query/types";
import { DIMENSION_LABELS, formatDimensionValue, formatMeasure, MEASURE_LABELS } from "../format";
import { formatShare } from "./share-chart";
import { lastYearRows, type LastYearLabels } from "./last-year";
import { BASED_ON, countOf, faded, fadedCaption, NOISE_EXPLAINED, rangeLine } from "./evidence";
import styles from "../Investigate.module.css";

/**
 * A query result as a table: every chart's table view, and the fallback when a chart can't color its series. An
 * average gets a "Based on" column after it, and a row over too few to go on is faded (Plot, #296).
 */
export function ResultTable({ result, height }: { result: QueryResult; height?: number }) {
  if (severalMeasures(result)) return <MeasuresResultTable result={result} height={height} />;
  const unit = result.evidence?.unit ?? null;
  const evidence = (i: number) => result.evidence?.rows[i];
  const anyFaded = result.rows.some((_, i) => faded(unit, evidence(i)));
  return (
    <>
      <div className={styles.tableWrap} style={height ? { height } : undefined}>
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
              {unit && (
                <th scope="col" className={styles.numeric}>
                  {BASED_ON}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, i) => (
              <tr key={i} className={faded(unit, evidence(i)) ? styles.faded : undefined}>
                {result.columns.map((c) => (
                  <td key={c.key} className={c.type === "number" ? styles.numeric : undefined}>
                    {c.type === "number"
                      ? formatMeasure(c.key as Measure, row[c.key as Measure])
                      : formatDimensionValue(c.key as Dimension, row[c.key as Dimension])}
                  </td>
                ))}
                {unit && (
                  <td className={styles.numeric}>
                    {evidence(i) ? countOf(unit, evidence(i)!.n) : ""}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {unit && anyFaded && <p className={styles.tableNote}>{fadedCaption(unit)}</p>}
    </>
  );
}

/** The measures of a lookup of several (contract.md, "Several measures"), in its columns' order; null for one. */
export function severalMeasures(result: QueryResult): Measure[] | null {
  const figures = result.measures;
  if (!figures) return null;
  const measures = result.columns
    .filter((c) => c.type === "number" && figures[c.key as Measure])
    .map((c) => c.key as Measure);
  return measures.length > 1 ? measures : null;
}

/** The overall row's breakdown cell: `All`, not "Total", since an average's overall figure isn't a sum (Plot, section 11). */
export const ALL_ROW = "All";

/**
 * A lookup of several measures as one table (Plot, section 11): a column per measure in the query's order, each
 * figure formatted for its own measure, an average's "Based on" column after it, a figure over too few faded on its
 * own (another measure in the row may have plenty), an average rating's likely range in its cell's tooltip, and the
 * overall figures as the last row, `All`.
 */
function MeasuresResultTable({ result, height }: { result: QueryResult; height?: number }) {
  const measures = severalMeasures(result)!;
  const dimensions = result.columns.filter((c) => !measures.includes(c.key as Measure));
  const figures = (m: Measure) => result.measures![m]!;
  const unitOf = (m: Measure) => figures(m).evidence?.unit ?? null;
  const isFaded = (m: Measure, i: number | "all") =>
    faded(unitOf(m), i === "all" ? figures(m).evidence?.total : figures(m).evidence?.rows[i]);
  const fadedUnits = [
    ...new Set(
      measures.filter((m) => result.rows.some((_, i) => isFaded(m, i))).map((m) => unitOf(m)!),
    ),
  ];
  const label = (m: Measure) => result.columns.find((c) => c.key === m)?.label ?? MEASURE_LABELS[m];
  const figureCells = (m: Measure, value: number | null | undefined, i: number | "all") => {
    const unit = unitOf(m);
    const evidence = i === "all" ? figures(m).evidence?.total : figures(m).evidence?.rows[i];
    const range = m === "avg_rating" ? rangeLine(value ?? null, evidence) : null;
    const dim = isFaded(m, i) ? ` ${styles.fadedCell}` : "";
    return [
      <td key={m} className={`${styles.numeric}${dim}`} title={range ?? undefined}>
        {formatMeasure(m, value)}
      </td>,
      ...(unit
        ? [
            <td key={`${m}-n`} className={`${styles.numeric}${dim}`}>
              {evidence ? countOf(unit, evidence.n) : ""}
            </td>,
          ]
        : []),
    ];
  };
  return (
    <>
      <div className={styles.tableWrap} style={height ? { height } : undefined}>
        <table className={`${styles.table} ${styles.measuresTable}`}>
          <thead>
            <tr>
              {dimensions.map((c) => (
                <th key={c.key} scope="col">
                  {c.label}
                </th>
              ))}
              {measures.flatMap((m) => [
                <th key={m} scope="col" className={styles.numeric}>
                  {label(m)}
                </th>,
                ...(unitOf(m)
                  ? [
                      // Several measures may each have one: each says whose it is to a screen reader.
                      <th
                        key={`${m}-n`}
                        scope="col"
                        className={styles.numeric}
                        aria-label={`${BASED_ON}, ${label(m).toLowerCase()}`}
                      >
                        {BASED_ON}
                      </th>,
                    ]
                  : []),
              ])}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, i) => (
              <tr key={i}>
                {dimensions.map((c) => (
                  <td key={c.key}>
                    {formatDimensionValue(c.key as Dimension, row[c.key as Dimension])}
                  </td>
                ))}
                {measures.flatMap((m) => figureCells(m, row[m] as number | null | undefined, i))}
              </tr>
            ))}
            <tr className={styles.allRow}>
              {dimensions.map((c, k) => (
                <th key={c.key} scope="row">
                  {k === 0 ? ALL_ROW : ""}
                </th>
              ))}
              {measures.flatMap((m) => figureCells(m, figures(m).total, "all"))}
            </tr>
          </tbody>
        </table>
      </div>
      {fadedUnits.map((unit) => (
        <p key={unit} className={styles.tableNote}>
          {fadedCaption(unit)}
        </p>
      ))}
    </>
  );
}

/** A result beside last year's as a table (Plot, #291): the group, the two quarters, then Δ and % change. */
export function LastYearTable({
  result,
  by,
  measure,
  labels,
}: {
  result: QueryResult;
  by: Dimension;
  measure: Measure;
  labels: LastYearLabels;
}) {
  const unit = result.evidence?.unit ?? null;
  const rows = lastYearRows(result, by, measure);
  return (
    <>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">{DIMENSION_LABELS[by]}</th>
              <th scope="col" className={styles.numeric}>
                {labels.now}
              </th>
              <th scope="col" className={styles.numeric}>
                {labels.then}
              </th>
              <th scope="col" className={styles.numeric} aria-label="Change">
                Δ
              </th>
              <th scope="col" className={styles.numeric}>
                % change
              </th>
              {unit && (
                <th scope="col" className={styles.numeric}>
                  {BASED_ON}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className={row.faded ? styles.faded : undefined}>
                <td>{row.group}</td>
                <td className={styles.numeric}>{row.now}</td>
                <td className={styles.numeric}>{row.then}</td>
                <td className={styles.numeric} title={row.noise ? NOISE_EXPLAINED : undefined}>
                  {row.delta}
                </td>
                <td className={styles.numeric} title={row.noise ? NOISE_EXPLAINED : undefined}>
                  {row.percent}
                </td>
                {unit && <td className={styles.numeric}>{row.basedOn ?? ""}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {unit && rows.some((row) => row.faded) && (
        <p className={styles.tableNote}>{fadedCaption(unit)}</p>
      )}
    </>
  );
}

/**
 * A result as shares (Plot, req_fa2e6a0dbbec): the group, its figure, then its Share of the total, the one before
 * the row limit; with the running share, largest first and a Running share column too.
 */
export function ShareTable({
  result,
  by,
  measure,
  running,
}: {
  result: QueryResult;
  by: Dimension;
  measure: Measure;
  running: boolean;
}) {
  const total = result.total ?? 0;
  const rows = result.rows.map((row) => ({
    group: row[by] ?? null,
    value: row[measure] ?? 0,
  }));
  if (running) rows.sort((a, b) => b.value - a.value);
  let sum = 0;
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">{DIMENSION_LABELS[by]}</th>
            <th scope="col" className={styles.numeric}>
              {MEASURE_LABELS[measure]}
            </th>
            <th scope="col" className={styles.numeric}>
              Share
            </th>
            {running && (
              <th scope="col" className={styles.numeric}>
                Running share
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const share = total > 0 ? row.value / total : 0;
            sum += share;
            return (
              <tr key={i}>
                <td>{formatDimensionValue(by, row.group)}</td>
                <td className={styles.numeric}>{formatMeasure(measure, row.value)}</td>
                <td className={styles.numeric}>{formatShare(share)}</td>
                {running && <td className={styles.numeric}>{formatShare(sum)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
