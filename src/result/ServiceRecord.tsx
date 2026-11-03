import { gradeFor, roundHalfUp } from "~/simulation/grading";
import type { QuarterId } from "~/simulation/quarters";
import { MEASURE_IDS as MEASURE_ORDER } from "~/simulation/types";
import {
  eventTitle,
  quarterName,
  REMOVAL_COPY,
  RESULT_COPY as COPY,
  scoreText,
  SERVICE_RECORD,
} from "./copy";
import type { ResultData } from "./result-data";
import styles from "./Result.module.css";

/**
 * The service record (endless.md section 6): every quarter played, newest first, with its measures, its overall
 * (a strike marked), and its event; then the tenure and the best quarter.
 */
export function ServiceRecord({
  record,
  removedAt,
}: {
  record: ResultData["record"];
  removedAt?: QuarterId;
}) {
  const c = COPY.reportCard;
  const rows = [...record].reverse();
  const mean = roundHalfUp(
    record.reduce((sum, row) => sum + row.overall.score, 0) / Math.max(1, record.length),
  );
  const best = record.reduce(
    (top, row) => (row.overall.score > top.overall.score ? row : top),
    record[0]!,
  );
  return (
    <section className={styles.card} aria-labelledby="service-record-heading">
      <h3 id="service-record-heading" className={styles.cardTitle}>
        {SERVICE_RECORD.heading}
      </h3>
      <div className={styles.tableWrap}>
        <table className={styles.reportCard}>
          <thead>
            <tr>
              <th scope="col">{SERVICE_RECORD.columns.quarter}</th>
              {MEASURE_ORDER.map((id) => (
                <th key={id} scope="col">
                  {c.measures[id]}
                </th>
              ))}
              <th scope="col">{SERVICE_RECORD.columns.overall}</th>
              <th scope="col">{SERVICE_RECORD.columns.event}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.quarter} data-strike={row.strike || undefined}>
                <th scope="row">{quarterName(row.quarter)}</th>
                {MEASURE_ORDER.map((id) => {
                  const m = row.measures.find((x) => x.id === id);
                  return <td key={id}>{m ? scoreText(m.score, m.grade) : ""}</td>;
                })}
                <td>{`${scoreText(row.overall.score, row.overall.grade)}${row.strike ? SERVICE_RECORD.strike : ""}`}</td>
                <td>{eventTitle(row.quarter, row.event)}</td>
              </tr>
            ))}
          </tbody>
          {removedAt && (
            <tfoot>
              <tr>
                <td colSpan={MEASURE_ORDER.length + 3}>{REMOVAL_COPY.finalRow(removedAt)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {record.length > 0 && (
        <>
          <p className={styles.happened}>
            {SERVICE_RECORD.tenure(record.length, mean, gradeFor(mean))}
          </p>
          <p className={styles.happened}>
            {SERVICE_RECORD.best(best.quarter, best.overall.score, best.overall.grade)}
          </p>
        </>
      )}
    </section>
  );
}
