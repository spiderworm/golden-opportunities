import { useEffect } from "react";
import { data, Form, redirect, useFetcher } from "react-router";

import { markReportSeen, writeReports } from "~/game/game.server";
import { BodyRefused, readCappedForm } from "~/platform/body.server";
import { isQuarterId } from "~/game/quarters";
import { track } from "~/platform/analytics/analytics.client";
import { trackServer } from "~/platform/analytics/analytics.server";
import { EChart } from "~/platform/charts/EChart";
import {
  eventTitle,
  gradeText,
  measureTexts,
  quarterName,
  RESULT_COPY,
  scoreText,
  SERVICE_RECORD,
} from "~/result/copy";
import { ServiceRecord } from "~/result/ServiceRecord";
import { Icon } from "~/shell/icons";
import type { ShellHandle } from "~/shell/Shell";
import { MEASURE_IDS, type MeasureId } from "~/simulation/types";
import type { Route } from "./+types/route";
import { greeting, REPORTS_COPY as COPY } from "./copy";
import { overallOption } from "./overall-chart";
import { reportCounts } from "./player";
import { applyReportChange, changeFrom, type ReportOutcome } from "./player.server";
import { PlayerReports, NewReportButton } from "./PlayerReports";
import type { ShopReport } from "./shop.server";
import { reportsData } from "./data.server";
import resultStyles from "~/result/Result.module.css";
import styles from "./Reports.module.css";

// Reports (docs/design/reports.md): the shop's reports at the top, one per played quarter, newest first, and the
// player's own below. The loader sends what the result screens already send, never the save or its seed.

export const handle: ShellHandle = { title: COPY.title };

export function meta() {
  return [{ title: "Reports · Orbital Books" }];
}

export function loader({ request }: Route.LoaderArgs) {
  return reportsData(request);
}

/**
 * Marks a shop report seen: its card opened (a fetcher), or its full results asked for (a form, which goes on to
 * them). Through React Router, so the shell's loader runs again and the badge follows (Audit, #281).
 */
/**
 * A report is at most 6 items, each a pin no larger than a query (16 KB) and a 500-character note, with an
 * 80-character title and a 1,000-character summary: about 110 KB as JSON, and three times that at worst once
 * form-encoded. 512 KB holds the largest a player can make; nothing else posts here.
 */
export const MAX_REPORTS_BODY = 524_288;

export async function action({ request }: Route.ActionArgs) {
  let form: URLSearchParams;
  try {
    // Read with a cap and a deadline (src/platform/body.server.ts): the deployed host is public (Audit).
    form = await readCappedForm(request, MAX_REPORTS_BODY);
  } catch (error) {
    if (!(error instanceof BodyRefused)) throw error;
    return data({ ok: false as const, reason: "invalid" as const }, { status: error.status });
  }
  const intent = form.get("intent");
  if (intent === "create" || intent === "update" || intent === "delete")
    return reportAction(request, form);
  const quarter = form.get("quarter");
  try {
    markReportSeen(request, quarter);
  } catch (error) {
    // A busy or changed save (409) only leaves the report new: it mustn't take the page to its error screen, or
    // keep the player from the results they asked for (Audit, #282). Anything else is a real refusal.
    if (!(error instanceof Response) || error.status !== 409) throw error;
  }
  if (form.get("intent") === "results" && isQuarterId(quarter))
    return redirect(`/result?quarter=${quarter}`);
  return null;
}

/**
 * Creates, edits or deletes one of the player's reports: checked again here, the id the server's, written whole in
 * one action (section 3). Answers what happened, for the editor: the report's id, or why it was refused.
 */
function reportAction(request: Request, form: URLSearchParams) {
  const change = changeFrom(form);
  if (!change) {
    // Counted too, as every refusal is (Audit, #287); its intent from a fixed list, never what was sent.
    const sent = form.get("intent");
    reportEvent(sent === "create" || sent === "update" || sent === "delete" ? sent : "other", {
      ok: false,
      reason: "invalid",
    });
    return data({ ok: false as const, reason: "invalid" as const }, { status: 400 });
  }
  let outcome: ReportOutcome = { ok: false, reason: "invalid" };
  try {
    writeReports(request, (save) => {
      outcome = applyReportChange(save, change, () => crypto.randomUUID());
      return outcome.ok ? outcome.reports : null;
    });
    reportEvent(change.intent, outcome as ReportOutcome);
  } catch (error) {
    // A busy or changed save (409): the editor keeps the draft and asks to save again, rather than the page going
    // to its error screen and losing it (Orbit, #284). Anything else is a real refusal.
    if (!(error instanceof Response) || error.status !== 409) throw error;
    return data({ ok: false as const, reason: "busy" as const }, { status: 409 });
  }
  const done = outcome as ReportOutcome;
  return done.ok
    ? { ok: true as const, id: done.id, intent: change.intent }
    : data({ ok: false as const, reason: done.reason }, { status: 400 });
}

/** Server side too, so a refusal the browser didn't see is still counted (section 5). Counts only, never words. */
function reportEvent(intent: string, written: ReportOutcome) {
  try {
    if (!written.ok) trackServer("game_report_refused", { intent, reason: written.reason });
    else {
      const report = written.reports.find((r) => r.id === written.id);
      trackServer("game_report_saved", {
        intent,
        reports: written.reports.length,
        ...(report ? reportCounts(report) : {}),
      });
    }
  } catch {
    /* A transport failure can't undo a saved report. */
  }
}

const measureName = (id: MeasureId) => RESULT_COPY.reportCard.measures[id];

export default function Reports({ loaderData }: Route.ComponentProps) {
  const { reports, record, removedAt, player, editable, quarters } = loaderData;
  const newReports = reports.filter((r) => r.new).length;
  // Once per visit to the page, with what it showed: counts only.
  useEffect(() => {
    track("reports_viewed", {
      shopReports: reports.length,
      newShopReports: newReports,
      playerReports: player.length,
    });
  }, []);
  const latest = reports[0];
  return (
    <div className={styles.page}>
      <div className={styles.top}>
        <p className={styles.greeting}>{greeting(newReports)}</p>
        {editable && <NewReportButton count={player.length} />}
      </div>
      <section className={styles.section} aria-labelledby="shop-reports">
        <h2 id="shop-reports" className={styles.sectionHeading}>
          {COPY.shopHeading}
        </h2>
        {!latest ? (
          <p className={styles.muted}>{COPY.noQuarters}</p>
        ) : (
          <>
            <Tiles latest={latest} before={reports[1]} />
            <div className={styles.row}>
              {reports.length > 1 && (
                <section className={styles.card} aria-labelledby="overall-chart">
                  <h3 id="overall-chart" className={styles.cardTitle}>
                    {COPY.chartTitle}
                  </h3>
                  <EChart
                    option={overallOption(
                      [...reports]
                        .reverse()
                        .map((r) => ({ label: quarterName(r.quarter), score: r.overall.score })),
                    )}
                    height={260}
                    label={COPY.chartTitle}
                  />
                </section>
              )}
              <ServiceRecord record={record} removedAt={removedAt ?? undefined} />
            </div>
            <ul className={styles.cards}>
              {reports.map((r) => (
                <li key={r.quarter}>
                  <ShopReportCard report={r} />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      <PlayerReports reports={player} editable={editable} quarters={quarters} />
    </div>
  );
}

/** The last played quarter's report card: overall, then the four measures, each against the quarter before. */
function Tiles({ latest, before }: { latest: ShopReport; before?: ShopReport }) {
  const tiles = [
    {
      id: "overall",
      label: COPY.overall,
      score: latest.overall.score,
      grade: latest.overall.grade,
    },
    ...MEASURE_IDS.map((id) => {
      const m = latest.measures.find((x) => x.id === id)!;
      return { id, label: measureName(id), score: m.score, grade: m.grade };
    }),
  ];
  const previous = (id: string) =>
    id === "overall" ? before?.overall.score : before?.measures.find((m) => m.id === id)?.score;
  return (
    <section aria-label={COPY.tilesLabel(quarterName(latest.quarter))} className={styles.tiles}>
      {tiles.map((t) => {
        const was = previous(t.id);
        // Q1 2194 has no quarter before it in the game: against its own goal, where a met goal scores 100.
        const badge =
          was === undefined
            ? t.score >= 100
              ? { text: COPY.goalMet, tone: "up" as const }
              : { text: COPY.belowGoal, tone: "down" as const }
            : {
                text: COPY.change(t.score - was, quarterName(before!.quarter)),
                tone:
                  t.score > was
                    ? ("up" as const)
                    : t.score < was
                      ? ("down" as const)
                      : ("neutral" as const),
              };
        return (
          <article key={t.id} className={styles.tile}>
            <h3 className={styles.tileLabel}>{t.label}</h3>
            <span className={styles.tileValue}>{scoreText(t.score, t.grade)}</span>
            <span className={resultStyles.badge} data-tone={badge.tone}>
              {badge.tone !== "neutral" && (
                <Icon name={badge.tone === "up" ? "arrowUp" : "arrowDown"} size={12} />
              )}{" "}
              {badge.text}
            </span>
          </article>
        );
      })}
    </section>
  );
}

/**
 * One quarter's report: its score, its measures against their goals, the plan, the event and what was found. New
 * until opened: opening the card or its full results marks it seen.
 */
function ShopReportCard({ report: r }: { report: ShopReport }) {
  const seen = useFetcher();
  const name = quarterName(r.quarter);
  const months = COPY.months(r.quarter);
  const binding = r.overall.allMet
    ? COPY.allMet
    : COPY.lowest(r.overall.binding.map(measureName).join(" and "));
  return (
    <details
      className={styles.card}
      onToggle={(e) => {
        if (!e.currentTarget.open) return;
        track("report_shop_opened", { quarter: r.quarter, new: r.new, via: "card" });
        if (r.new && seen.state === "idle" && !seen.data)
          void seen.submit({ quarter: r.quarter }, { method: "post", action: "/reports" });
      }}
    >
      <summary className={styles.summary}>
        <h3 className={styles.cardTitle}>
          {COPY.quarterReport(name)}
          {r.new && (
            <span className={styles.newBadge}>
              <span className={styles.visuallyHidden}>{COPY.newName}</span>
              <span aria-hidden="true">{COPY.newBadge}</span>
            </span>
          )}
        </h3>
        <span className={styles.scoreLine}>
          {scoreText(r.overall.score, r.overall.grade)}
          {r.overall.strike && SERVICE_RECORD.strike}
        </span>
      </summary>
      <dl className={styles.parts}>
        <dt>{COPY.parts.score}</dt>
        <dd>
          {`${scoreText(r.overall.score, r.overall.grade)}${r.overall.strike ? SERVICE_RECORD.strike : ""}. ${binding}.`}
        </dd>
        <dt>{COPY.parts.goals}</dt>
        <dd>
          <ul className={styles.plain}>
            {r.measures.map((m) => {
              const text = measureTexts(m);
              return (
                <li key={m.id}>
                  {`${measureName(m.id)}: ${COPY.goalLine(text.result, text.goal)}, ${m.score} (${gradeText(m.grade)})`}
                </li>
              );
            })}
          </ul>
        </dd>
        <dt>{COPY.parts.plan}</dt>
        <dd>
          {r.plan.picks ? (
            <ul className={styles.plain}>
              {r.plan.picks.map((pick, i) => (
                <li key={months[i]}>{`${months[i]}: ${pick ?? COPY.noPick}`}</li>
              ))}
              {r.plan.moves.map((m) => (
                <li key={m}>{COPY.oneMore(m)}</li>
              ))}
            </ul>
          ) : r.plan.moves.length ? (
            r.plan.moves.join(", ")
          ) : (
            COPY.heldCourse
          )}
        </dd>
        <dt>{COPY.parts.event}</dt>
        <dd>{eventTitle(r.quarter, r.event)}</dd>
        <dt>{COPY.parts.found}</dt>
        <dd>
          {r.found.length ? (
            <ul className={styles.plain}>
              {r.found.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          ) : (
            COPY.nothingFound
          )}
        </dd>
      </dl>
      <Form
        method="post"
        action="/reports"
        onSubmit={() =>
          track("report_shop_opened", { quarter: r.quarter, new: r.new, via: "results" })
        }
      >
        <input type="hidden" name="quarter" value={r.quarter} />
        <button type="submit" name="intent" value="results" className={styles.linkButton}>
          {COPY.fullResults}
        </button>
      </Form>
    </details>
  );
}
