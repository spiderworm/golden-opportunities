import { Link } from "react-router";

import { newReportsOf } from "~/game/progress";
import { quarterLabel } from "~/game/results.server";
import { getGameSession } from "~/game/session.server";
import type { ShellHandle } from "~/shell/Shell";
import type { Route } from "./+types/route";
import { greeting, REPORTS_COPY as COPY } from "./copy";
import styles from "./Reports.module.css";

// Reports (docs/design/reports.md): the shop's reports at the top, one per played quarter, newest first, and the
// player's own below. The loader sends what the result screens already send, never the save or its seed.

export const handle: ShellHandle = { title: COPY.title };

export function meta() {
  return [{ title: "Reports · Orbital Books" }];
}

export function loader({ request }: Route.LoaderArgs) {
  const { save } = getGameSession(request);
  const unseen = new Set(newReportsOf(save));
  return {
    quarters: save.played
      .map((q) => ({ quarter: q.period, label: quarterLabel(q.period), new: unseen.has(q.period) }))
      .reverse(),
    newReports: unseen.size,
  };
}

export default function Reports({ loaderData }: Route.ComponentProps) {
  const { quarters, newReports } = loaderData;
  return (
    <div className={styles.page}>
      <p className={styles.greeting}>{greeting(newReports)}</p>
      <section className={styles.section} aria-labelledby="shop-reports">
        <h2 id="shop-reports" className={styles.sectionHeading}>
          {COPY.shopHeading}
        </h2>
        {quarters.length === 0 ? (
          <p className={styles.muted}>{COPY.noQuarters}</p>
        ) : (
          <ul className={styles.cards}>
            {quarters.map((q) => (
              <li key={q.quarter} className={styles.card}>
                <h3 className={styles.cardTitle}>
                  {COPY.quarterReport(q.label)}
                  {q.new && <span className={styles.newBadge}>{COPY.newBadge}</span>}
                </h3>
                <Link to={`/result?quarter=${q.quarter}`}>{COPY.fullResults}</Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
