import type { QueryResult } from "~/query/types";
import { formatDimensionValue, formatMeasure } from "./format";
import styles from "./Investigate.module.css";

const STARS = ["5", "4", "3", "2", "1"] as const;

/** Each star rating's count and share, five stars first, with the mean they make. Null when nobody rated it. */
export function ratingsModel(result: QueryResult) {
  const count = (stars: string) => result.rows.find((row) => row.stars === stars)?.ratings ?? 0;
  const rows = STARS.map((stars) => ({ stars, count: Number(count(stars)) }));
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  if (total === 0) return null;
  const mean = rows.reduce((sum, row) => sum + Number(row.stars) * row.count, 0) / total;
  return { rows: rows.map((row) => ({ ...row, share: row.count / total })), total, mean };
}

/** One title's ratings by stars: a bar per rating, as the reference dashboard's list cards draw shares. */
export function RatingsHistogram({ title, result }: { title: string; result: QueryResult }) {
  const model = ratingsModel(result);
  return (
    <section className={styles.ratings} aria-labelledby="title-ratings-title">
      <h3 id="title-ratings-title" className={styles.ratingsTitle}>
        Ratings
      </h3>
      {model ? (
        <>
          <p className={styles.ratingsSummary}>
            Average {formatMeasure("avg_rating", model.mean)} from {formatMeasure("ratings", model.total)}{" "}
            {model.total === 1 ? "rating" : "ratings"}
          </p>
          <table className={styles.ratingsTable}>
            <caption className={styles.visuallyHidden}>Ratings of {title} by stars</caption>
            <thead className={styles.visuallyHidden}>
              <tr>
                <th scope="col">Stars</th>
                <th scope="col">Ratings</th>
                <th scope="col">Share</th>
              </tr>
            </thead>
            <tbody>
              {model.rows.map((row) => (
                <tr key={row.stars}>
                  <th scope="row" className={styles.ratingsStars}>
                    {formatDimensionValue("stars", row.stars)}
                  </th>
                  <td className={styles.ratingsBarCell}>
                    <span className={styles.ratingsTrack}>
                      <span className={styles.ratingsBar} style={{ width: `${(row.share * 100).toFixed(1)}%` }} />
                    </span>
                    <span className={styles.ratingsCount}>{formatMeasure("ratings", row.count)}</span>
                  </td>
                  <td className={styles.ratingsShare}>{`${Math.round(row.share * 100)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p className={styles.ratingsSummary}>No one has rated this title.</p>
      )}
      <p className={styles.source}>Ratings aren't dated, so the screen's other filters don't apply to them. Source: {result.source}</p>
    </section>
  );
}
