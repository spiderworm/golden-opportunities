import type { Dimension, Measure, QueryResult } from "~/query/types";
import { formatDimensionValue, formatMeasure } from "../format";
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
