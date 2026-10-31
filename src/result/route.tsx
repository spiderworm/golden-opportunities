import { useEffect, useMemo, useRef, useState } from "react";
import { Link, redirect } from "react-router";

import { getOutcome } from "~/game/game.server";
import { runQuery } from "~/query/run-query.server";
import { getGameSession } from "~/game/session.server";
import { track } from "~/platform/analytics/analytics.client";
import { EChart } from "~/platform/charts/EChart";
import type { ShellHandle } from "~/shell/Shell";
import type { Route } from "./+types/route";
import type { ReportCard as Card } from "~/simulation/types";
import {
  administratorLine,
  badgeText,
  bossLine,
  certificateText,
  foundFooter,
  gradeText,
  heldCourseText,
  lowestMeasureLines,
  lowestMeasureSpeakers,
  measureTexts,
  moneyShort,
  RESULT_COPY as COPY,
  scoreText,
  seasonNote,
} from "./copy";
import { earnedDiscoveries, type EarnedDiscovery } from "./discoveries.server";
import { OUTCOME_COLORS, outcomeOption } from "./outcome-chart";
import styles from "./Result.module.css";

export const handle: ShellHandle = { title: "Results", standingOrder: false };


export function meta({}: Route.MetaArgs) {
  return [{ title: "Q1 2194: the results | Orbital Books" }];
}

export function loader({ request }: Route.LoaderArgs) {
  const outcome = getOutcome(request);
  if (!outcome) throw redirect("/decide");
  // Last year, for the season note and the faint reference line.
  const view = getGameSession(request).queryView;
  const byQuarter = runQuery({ measure: "revenue", by: ["quarter"] }, view).rows;
  const lastQ1 = byQuarter.find((r) => r.quarter === "2193-Q1")?.revenue ?? 0;
  const lastQ4 = byQuarter.find((r) => r.quarter === "2193-Q4")?.revenue ?? 0;
  const reference = runQuery({ measure: "revenue", by: ["month"], filter: { quarter: ["2193-Q4"] } }, view).rows.map((r) => ({
    month: r.month ?? "",
    revenue: r.revenue ?? 0,
  }));
  return { outcome, lastQ1, lastQ4, reference, discoveries: earnedDiscoveries(outcome.discoveries) };
}

export default function Result({ loaderData }: Route.ComponentProps) {
  const { outcome, lastQ1, lastQ4, reference, discoveries } = loaderData;
  const [assumptionsOpen, setAssumptionsOpen] = useState(false);
  const assumptionsRef = useRef<HTMLElement>(null);
  const holdingCourse = outcome.plan.levers.length === 0;
  const { plan, holdCourse } = outcome.totals;
  // A fixed vocabulary for analytics: "repick+events", or "hold".
  const levers = outcome.plan.levers.join("+") || "hold";
  const overall = outcome.reportCard.plan.overall;

  useEffect(() => {
    track("result_viewed", {
      levers,
      moves: outcome.plan.levers.length,
      overall: overall.score,
      binding: overall.binding.join("+"),
      discoveries: outcome.discoveries.length,
    });
  }, [levers, outcome.plan.levers.length, overall.score, overall.binding, outcome.discoveries.length]);

  const option = useMemo(
    () =>
      outcomeOption({
        months: outcome.monthly.map((m) => m.month),
        plan: outcome.monthly.map((m) => m.plan.revenue),
        holdCourse: outcome.monthly.map((m) => m.holdCourse.revenue),
        reference,
      }),
    [outcome, reference],
  );

  function openAssumptions() {
    setAssumptionsOpen(true);
    track("result_assumptions_opened", { levers });
    requestAnimationFrame(() => assumptionsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  return (
    <div className={styles.page}>
      <h2 className={styles.title}>{COPY.title}</h2>

      <ReportCard
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
            <LegendItem color={OUTCOME_COLORS.reference} label={COPY.lines.reference} />
          </ul>
        </header>
        <EChart option={option} height={300} label={`${COPY.chartTitle}: ${COPY.lines.plan}, ${COPY.lines.holdCourse}, ${COPY.lines.reference}`} />
        <p className={styles.note}>{seasonNote((1 - plan.revenue / lastQ4) * 100, lastQ1)}</p>
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
          <Link to="/investigate" className={styles.button}>
            {COPY.backToLedgers}
          </Link>
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
    </div>
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
function ReportCard({ plan, holdCourse, holdingCourse, onBosses }: { plan: Card; holdCourse: Card; holdingCourse: boolean; onBosses: (open: boolean) => void }) {
  const c = COPY.reportCard;
  const { overall } = plan;
  const certificates = plan.certificates.map(certificateText).filter(Boolean);
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
              <th scope="col">{c.columns.lastYear}</th>
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
      <p className={styles.note}>{c.goalsNote}</p>

      {certificates.length > 0 && (
        <section className={styles.certificates} aria-labelledby="certificates-heading">
          <h4 id="certificates-heading" className={styles.subheading}>
            {c.certificatesHeading}
          </h4>
          <ul>
            {certificates.map((text) => (
              <li key={text}>{text}</li>
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

