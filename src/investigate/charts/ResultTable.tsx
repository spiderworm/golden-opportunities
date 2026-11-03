import type { Dimension, Measure, QueryResult } from "~/query/types";
import { DIMENSION_LABELS, formatDimensionValue, formatMeasure } from "../format";
import { lastYearRows, type LastYearLabels } from "./last-year";
import styles from "../Investigate.module.css";

/** A query result as a table: every chart's table view, and the fallback when a chart can't color its series. */
export function ResultTable({ result, height }: { result: QueryResult; height?: number }) {
  return (
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
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row, i) => (
            <tr key={i}>
              {result.columns.map((c) => (
                <td key={c.key} className={c.type === "number" ? styles.numeric : undefined}>
                  {c.type === "number"
                    ? formatMeasure(c.key as Measure, row[c.key as Measure])
                    : formatDimensionValue(c.key as Dimension, row[c.key as Dimension])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
              <td className={styles.numeric}>{row.delta}</td>
              <td className={styles.numeric}>{row.percent}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
