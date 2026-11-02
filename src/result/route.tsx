import { useEffect, useMemo, useRef, useState } from "react";
import { Form, Link, redirect } from "react-router";

import { isQuarterId } from "~/game/quarters";
import { getResultData } from "~/game/results.server";
import { track } from "~/platform/analytics/analytics.client";
import { EChart } from "~/platform/charts/EChart";
import type { ShellHandle } from "~/shell/Shell";
import type { Route } from "./+types/route";
import { gradeFor, roundHalfUp } from "~/simulation/grading";
import { nextQuarter, type QuarterId } from "~/simulation/quarters";
import { MEASURE_IDS as MEASURE_ORDER, type ReportCard as Card } from "~/simulation/types";
import {
  administratorLine,
  badgeText,
  continueTo,
  eventTitle,
  laterSeasonNote,
  quarterCopy,
  quarterName,
  SERVICE_RECORD,
  REMOVAL_COPY,
  bossLine,
  certificateText,
  foundFooter,
  gradeText,
  HALF_YEAR_COPY,
  halfYearAdministratorLine,
  halfYearScoreText,
  heldCourseText,
  lowestMeasureLines,
  lowestMeasureSpeakers,
  measureTexts,
  moneyShort,
  q2SeasonNote,
  QUARTER_COPY,
  RESULT_COPY as COPY,
  scoreText,
  seasonNote,
} from "./copy";
import { earnedDiscoveries, laterDiscoveries, type EarnedDiscovery } from "./discoveries.server";
import { OUTCOME_COLORS, outcomeOption } from "./outcome-chart";
import { heldCourse, planSummary, type HalfYearData, type ResultData } from "./result-data";
import styles from "./Result.module.css";

export const handle: ShellHandle = { title: "Results", standingOrder: false };


export function meta({ loaderData }: Route.MetaArgs) {
  const copy = loaderData ? quarterCopy(loaderData.quarter, loaderData.referenceLabel) : QUARTER_COPY["2194-Q1"];
  return [{ title: `${copy.title} | Orbital Books` }];
}

/** The latest played quarter, or `?quarter=2194-Q1` for an earlier one; a quarter not played yet goes to Decide. */
export function loader({ request }: Route.LoaderArgs): ResultData {
  const asked = new URL(request.url).searchParams.get("quarter");
  const data = getResultData(request, isQuarterId(asked) ? asked : undefined);
  if (!data) throw redirect("/decide");
  // Q1 and Q2 have their own three (A to F); from Q3 on, the quarter's own offers (Frank's #221).
  const later = data.quarter !== "2194-Q1" && data.quarter !== "2194-Q2";
  return { ...data, discoveries: later ? laterDiscoveries(data.laterDiscoveries, data.discoveryOffers) : earnedDiscoveries(data.discoveries, data.quarter) };
}

export default function Result({ loaderData }: Route.ComponentProps) {
  const { quarter, outcome, sameQuarterLastYear, previousQuarter, reference, referenceLabel, discoveries, next, canPlayAgain, halfYear, record, goalStretch, season2193, removed: removal } = loaderData;
  // The panel's vote closes the removal quarter's screen only: an earlier quarter's, opened later, stays as it was
  // (Audit, on #226), as Q1's did under the half-year review.
  const removed = removal && removal.at === quarter ? removal : null;
  const q = quarterCopy(quarter, referenceLabel, goalStretch);
  // The half-year review closes the game under Q2's result while the game ends there (Q1's screen, opened later,
  // gains nothing: q2.md, #139). Once the endless game goes on past Q2, the service record takes its place.
  const review = halfYear && quarter === "2194-Q2" ? halfYear : null;
  const [assumptionsOpen, setAssumptionsOpen] = useState(false);
  const assumptionsRef = useRef<HTMLElement>(null);
  const holdingCourse = heldCourse(outcome);
  const { plan, holdCourse } = outcome.totals;
  const levers = planSummary(outcome);
  const overall = outcome.reportCard.plan.overall;

  useEffect(() => {
    track("result_viewed", {
      quarter,
      levers,
      moves: outcome.plan.levers.length,
      overall: overall.score,
      binding: overall.binding.join("+"),
      discoveries: outcome.discoveries.length,
      // Only where the review shows: Q1's screen, opened again after Q2, doesn't show it.
      ...(halfYear && quarter === "2194-Q2" ? { halfYear: halfYear.score } : {}),
    });
  }, [quarter, levers, outcome.plan.levers.length, overall.score, overall.binding, outcome.discoveries.length, halfYear]);

  const option = useMemo(
    () =>
      outcomeOption({
        months: outcome.monthly.map((m) => m.month),
        plan: outcome.monthly.map((m) => m.plan.revenue),
        holdCourse: outcome.monthly.map((m) => m.holdCourse.revenue),
        reference,
        referenceLabel: q.reference,
        referenceYear: referenceLabel.slice(-4),
      }),
    [outcome, reference, q.reference, referenceLabel],
  );

  function openAssumptions() {
    setAssumptionsOpen(true);
    track("result_assumptions_opened", { levers });
    requestAnimationFrame(() => assumptionsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  return (
    <div className={styles.page}>
      <h2 className={styles.title}>{q.title}</h2>

      <ReportCard
        quarter={quarter}
        copy={q}
        plan={outcome.reportCard.plan}
        holdCourse={outcome.reportCard.holdCourse}
        holdingCourse={holdingCourse}
        onBosses={(open) => open && track("result_bosses_opened", { levers })}
      />

      <section className={styles.tiles} aria-label="Totals">
        <Tile label={COPY.tiles.grossProfit} value={moneyShort(plan.grossProfit)} delta={plan.grossProfit - holdCourse.grossProfit} money holdingCourse={holdingCourse} />
        <Tile label={COPY.tiles.revenue} value={moneyShort(plan.revenue)} delta={plan.revenue - holdCourse.revenue} money holdingCourse={holdingCourse} />
        <Tile label={COPY.tiles.units} value={Math.round(plan.units).toLocaleString("en-US")} delta={plan.units - holdCourse.units} holdingCourse={holdingCourse} />
      </section>

      <section className={styles.card} aria-labelledby="outcome-chart-title">
        <header className={styles.cardHeader}>
          <h3 id="outcome-chart-title" className={styles.cardTitle}>
            {COPY.chartTitle}
          </h3>
          <ul className={styles.legend} aria-label="Lines">
            <LegendItem color={OUTCOME_COLORS.plan} label={COPY.lines.plan} />
            <LegendItem color={OUTCOME_COLORS.holdCourse} label={COPY.lines.holdCourse} />
            <LegendItem color={OUTCOME_COLORS.reference} label={q.reference} />
          </ul>
        </header>
        <EChart option={option} height={300} label={`${COPY.chartTitle}: ${COPY.lines.plan}, ${COPY.lines.holdCourse}, ${q.reference}`} />
        <p className={styles.note}>
          {quarter === "2194-Q1"
            ? seasonNote((1 - plan.revenue / previousQuarter) * 100, sameQuarterLastYear)
            : quarter === "2194-Q2"
              ? q2SeasonNote(plan.revenue, previousQuarter)
              : laterSeasonNote(quarter, plan.revenue, previousQuarter, referenceLabel, season2193)}
        </p>
      </section>

      <section className={styles.card} aria-label="What happened">
        {outcome.happened.map((sentence) => (
          <p key={sentence} className={styles.happened}>
            {sentence}
          </p>
        ))}
        <div className={styles.actions}>
          <button type="button" className={styles.button} onClick={openAssumptions} aria-expanded={assumptionsOpen} aria-controls="assumptions">
            {COPY.seeAssumptions}
          </button>
          {/* Under Q2's half-year review, and once the panel has voted, the way back to the ledgers is below. */}
          {!review && !removed && (
            <Link to="/investigate" className={styles.button}>
              {COPY.backToLedgers}
            </Link>
          )}
          {/* Only under the quarter just played: an earlier quarter's screen, opened later, gains nothing. */}
          {next !== null && next === nextQuarter(quarter) && (
            <Link to="/" className={`${styles.button} ${styles.primary}`} onClick={() => track("result_continued", { to: next })}>
              {continueTo(next)}
            </Link>
          )}
        </div>
      </section>

      <Discoveries discoveries={discoveries} />

      <section id="assumptions" ref={assumptionsRef} className={styles.card} hidden={!assumptionsOpen} aria-labelledby="assumptions-heading">
        <h3 id="assumptions-heading" className={styles.cardTitle}>
          {COPY.assumptions.heading}
        </h3>
        <p className={styles.intro}>{COPY.assumptions.intro}</p>
        <ul className={styles.rules}>
          {outcome.assumptions.map((rule) => (
            <li key={rule.id} className={styles.rule} data-used={rule.usedByPlan || undefined}>
              <span className={styles.tag} data-source={rule.source}>
                {COPY.assumptions.tags[rule.source]}
              </span>
              <span>
                {rule.text}
                {rule.usedByPlan && <span className={styles.usedLabel}>{COPY.assumptions.used}</span>}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* The review closes the game under Q2's result only: Q1's screen, opened later, gains nothing (q2.md, #139). */}
      {review && <HalfYearReview review={review} canPlayAgain={canPlayAgain} />}
      {removed ? (
        <Removal removed={removed} record={record} canPlayAgain={canPlayAgain} />
      ) : (
        !review && quarter !== "2194-Q1" && <ServiceRecord record={record} />
      )}
    </div>
  );
}

/** The game's last word (q2.md section 7): each quarter's scores, the half-year score, and a new game. */
/**
 * The service record (endless.md section 6): every quarter played, newest first, with its measures, its overall
 * (a strike marked), and its event; then the tenure and the best quarter.
 */
function ServiceRecord({ record, removedAt }: { record: ResultData["record"]; removedAt?: QuarterId }) {
  const c = COPY.reportCard;
  const rows = [...record].reverse();
  const mean = roundHalfUp(record.reduce((sum, row) => sum + row.overall.score, 0) / Math.max(1, record.length));
  const best = record.reduce((top, row) => (row.overall.score > top.overall.score ? row : top), record[0]!);
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
          <p className={styles.happened}>{SERVICE_RECORD.tenure(record.length, mean, gradeFor(mean))}</p>
          <p className={styles.happened}>{SERVICE_RECORD.best(best.quarter, best.overall.score, best.overall.grade)}</p>
        </>
      )}
    </section>
  );
}

/**
 * Once the panel has voted (endless.md section 7): the whole board speaks, the facts are plain, and the service
 * record ends with the removal. Play again starts a new game; the ledgers stay open to look at.
 */
function Removal({ removed, record, canPlayAgain }: { removed: NonNullable<ResultData["removed"]>; record: ResultData["record"]; canPlayAgain: boolean }) {
  const c = COPY.reportCard;
  return (
    <section className={styles.card} aria-labelledby="removal-heading">
      <h3 id="removal-heading" className={styles.cardTitle}>
        {REMOVAL_COPY.heading}
      </h3>
      {REMOVAL_COPY.lines.map(({ boss, line }) => (
        <figure key={boss} className={styles.lowest}>
          <blockquote className={styles.lowestLines}>
            <p>{line}</p>
          </blockquote>
          <figcaption className={styles.boss}>{c.bosses[boss]}</figcaption>
        </figure>
      ))}
      <p className={styles.happened}>{REMOVAL_COPY.facts(removed.strikes, record.length, removed.at)}</p>
      <ServiceRecord record={record} removedAt={removed.at} />
      <div className={styles.actions}>
        {canPlayAgain && (
          <Form method="post" action="/game/new" onSubmit={() => track("result_play_again", { removed: removed.at })}>
            <button type="submit" className={`${styles.button} ${styles.primary}`}>
              {REMOVAL_COPY.playAgain}
            </button>
          </Form>
        )}
        <Link to="/investigate" className={styles.button}>
          {REMOVAL_COPY.backToLedgers}
        </Link>
      </div>
    </section>
  );
}

function HalfYearReview({ review, canPlayAgain }: { review: HalfYearData; canPlayAgain: boolean }) {
  const c = COPY.reportCard;
  return (
    <section className={styles.card} aria-labelledby="half-year-heading">
      <h3 id="half-year-heading" className={styles.cardTitle}>
        {HALF_YEAR_COPY.heading}
      </h3>
      <div className={styles.tableWrap}>
        <table className={styles.reportCard}>
          <thead>
            <tr>
              <th scope="col">{HALF_YEAR_COPY.quarter}</th>
              {MEASURE_ORDER.map((id) => (
                <th key={id} scope="col">
                  {c.measures[id]}
                </th>
              ))}
              <th scope="col">{HALF_YEAR_COPY.overall}</th>
            </tr>
          </thead>
          <tbody>
            {review.quarters.map((row) => (
              <tr key={row.quarter}>
                <th scope="row">{HALF_YEAR_COPY.quarters[row.quarter]}</th>
                {MEASURE_ORDER.map((id) => {
                  const m = row.measures.find((x) => x.id === id);
                  return <td key={id}>{m ? scoreText(m.score, m.grade) : ""}</td>;
                })}
                <td>{scoreText(row.overall.score, row.overall.grade)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={styles.overall}>
        <div className={styles.score}>
          <span className={styles.scoreLine}>{halfYearScoreText(review.score, review.grade)}</span>
        </div>
        <figure className={styles.lowest}>
          <blockquote className={styles.lowestLines}>
            <p>{halfYearAdministratorLine(review.score)}</p>
          </blockquote>
          <figcaption className={styles.boss}>{c.bosses.overall}</figcaption>
        </figure>
      </div>
      <p className={styles.happened}>{HALF_YEAR_COPY.closing}</p>
      <div className={styles.actions}>
        {canPlayAgain && (
          <Form method="post" action="/game/new" onSubmit={() => track("result_play_again", { halfYear: review.score })}>
            <button type="submit" className={`${styles.button} ${styles.primary}`}>
              {HALF_YEAR_COPY.playAgain}
            </button>
          </Form>
        )}
        <Link to="/investigate" className={styles.button}>
          {HALF_YEAR_COPY.backToLedgers}
        </Link>
      </div>
    </section>
  );
}

function tone(value: number): "up" | "down" | "neutral" {
  return value > 0 ? "up" : value < 0 ? "down" : "neutral";
}

function Tile({ label, value, delta, money, holdingCourse }: { label: string; value: string; delta: number; money?: boolean; holdingCourse: boolean }) {
  const amount = money ? moneyShort(delta) : Math.round(Math.abs(delta)).toLocaleString("en-US");
  return (
    <article className={styles.tile}>
      <h3 className={styles.tileLabel}>{label}</h3>
      <span className={styles.tileValue}>{value}</span>
      <span className={styles.badge} data-tone={holdingCourse ? "neutral" : tone(delta)}>
        {holdingCourse ? COPY.holdCourseBadge : badgeText(amount, delta)}
      </span>
    </article>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <li>
      <span className={styles.legendLine} style={{ background: color }} />
      {label}
    </li>
  );
}

/**
 * The report card, simple first (m1-copy section 4, "Screen order"): the
 * overall score, the lowest measure's boss on it, the table with that row
 * marked, certificates, and the rest of the bosses tucked away.
 */
function ReportCard({ quarter, copy: q, plan, holdCourse, holdingCourse, onBosses }: { quarter: QuarterId; copy: ReturnType<typeof quarterCopy>; plan: Card; holdCourse: Card; holdingCourse: boolean; onBosses: (open: boolean) => void }) {
  const c = COPY.reportCard;
  const { overall } = plan;
  const certificates = plan.certificates.map((certificate) => certificateText(certificate, quarter)).filter(Boolean);
  return (
    <section className={styles.card} aria-labelledby="report-card-heading">
      <h3 id="report-card-heading" className={styles.cardTitle}>
        {c.heading}
      </h3>

      <div className={styles.overall}>
        <div className={styles.score}>
          <span className={styles.scoreHeading}>{c.overall}</span>
          <span className={styles.scoreLine}>
            {overall.score}
            <span className={styles.grade}>{gradeText(overall.grade)}</span>
          </span>
          <span className={styles.scoreExplainer}>{c.overallExplainer}</span>
          {!holdingCourse && <span className={styles.scoreHeading}>{heldCourseText(holdCourse.overall.score, holdCourse.overall.grade)}</span>}
        </div>
        <figure className={styles.lowest}>
          <blockquote className={styles.lowestLines}>
            {lowestMeasureLines(plan).map((line) => (
              <p key={line}>{line}</p>
            ))}
          </blockquote>
          <figcaption className={styles.boss}>{lowestMeasureSpeakers(plan)}</figcaption>
        </figure>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.reportCard}>
          <thead>
            <tr>
              <th scope="col">{c.columns.measure}</th>
              <th scope="col">{c.columns.result}</th>
              <th scope="col">{q.lastYear}</th>
              <th scope="col">{c.columns.goal}</th>
              <th scope="col">{c.columns.score}</th>
              {!holdingCourse && <th scope="col">{c.columns.holdCourse}</th>}
            </tr>
          </thead>
          <tbody>
            {plan.measures.map((m) => {
              const held = holdCourse.measures.find((h) => h.id === m.id);
              const text = measureTexts(m);
              // When every goal is met, no single measure sets the score.
              const binding = !overall.allMet && overall.binding.includes(m.id);
              const close = !overall.allMet && overall.closeBehind.includes(m.id);
              return (
                <tr key={m.id} data-binding={binding || undefined}>
                  <th scope="row">
                    {c.measures[m.id]}
                    {binding && <span className={styles.bindingTag}>{c.binding}</span>}
                    {close && <span className={styles.closeTag}>{c.closeBehind}</span>}
                  </th>
                  <td>{text.result}</td>
                  <td>{text.lastYear}</td>
                  <td>{text.goal}</td>
                  <td>
                    <span className={styles.measureScore}>{scoreText(m.score, m.grade)}</span>
                    {m.exceeds && <span className={styles.award}>{c.exceeds}</span>}
                  </td>
                  {!holdingCourse && <td className={styles.muted}>{held ? scoreText(held.score, held.grade) : ""}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className={styles.note}>{q.goalsNote}</p>

      {certificates.length > 0 && (
        <section className={styles.certificates} aria-labelledby="certificates-heading">
          <h4 id="certificates-heading" className={styles.subheading}>
            {c.certificatesHeading}
          </h4>
          <ul>
            {certificates.map((text) => (
              <li key={text}>
                <span>{text}</span>
                <small className={styles.issuer}>{c.certificateIssuer}</small>
              </li>
            ))}
          </ul>
        </section>
      )}

      <details className={styles.disclosure} onToggle={(e) => onBosses(e.currentTarget.open)}>
        <summary>{c.bossesDisclosure}</summary>
        <ul className={styles.bosses}>
          {plan.measures.map((m) => (
            <li key={m.id}>
              <span className={styles.boss}>{c.bosses[m.id]}</span>
              <q className={styles.bossLine}>{bossLine(m)}</q>
            </li>
          ))}
          <li>
            <span className={styles.boss}>{c.bosses.overall}</span>
            <q className={styles.bossLine}>{administratorLine(overall.score)}</q>
          </li>
        </ul>
      </details>
    </section>
  );
}

function Discoveries({ discoveries }: { discoveries: EarnedDiscovery[] }) {
  return (
    <section className={styles.card} aria-labelledby="discoveries-heading">
      <h3 id="discoveries-heading" className={styles.cardTitle}>
        {COPY.discoveries.heading}
      </h3>
      <ul className={styles.discoveries}>
        {discoveries.map((d) => (
          <li key={d.id} className={styles.discovery} data-found={d.found || undefined}>
            <span className={styles.marker}>{d.found ? COPY.discoveries.found : COPY.discoveries.notFound}</span>
            <span>{d.text}</span>
          </li>
        ))}
      </ul>
      <p className={styles.note}>{foundFooter(discoveries.filter((d) => d.found).length)}</p>
    </section>
  );
}

