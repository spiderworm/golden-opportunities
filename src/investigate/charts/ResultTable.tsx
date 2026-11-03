import type { Dimension, Measure, QueryResult } from "~/query/types";
import { DIMENSION_LABELS, formatDimensionValue, formatMeasure } from "../format";
import { lastYearRows, type LastYearLabels } from "./last-year";
import { BASED_ON, countOf, faded, fadedCaption, NOISE_EXPLAINED } from "./evidence";
import styles from "../Investigate.module.css";

/**
 * A query result as a table: every chart's table view, and the fallback when a chart can't color its series. An
 * average gets a "Based on" column after it, and a row over too few to go on is faded (Plot, #296).
 */
export function ResultTable({ result, height }: { result: QueryResult; height?: number }) {
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
  return (
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
          </tr>
        </thead>
        <tbody>
          {lastYearRows(result, by, measure).map((row, i) => (
            <tr key={i}>
              <td>{row.group}</td>
              <td className={styles.numeric}>{row.now}</td>
              <td className={styles.numeric}>{row.then}</td>
              <td className={styles.numeric} title={row.noise ? NOISE_EXPLAINED : undefined}>
                {row.delta}
              </td>
              <td className={styles.numeric} title={row.noise ? NOISE_EXPLAINED : undefined}>
                {row.percent}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
