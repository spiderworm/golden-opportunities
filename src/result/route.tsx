import { useEffect, useMemo, useRef, useState } from "react";
import { Link, redirect } from "react-router";

import { getOutcome } from "~/game-stub/game.server";
import { runQuery } from "~/query/run-query.server";
import { resolveQueryView } from "~/query/view.server";
import { track } from "~/platform/analytics/analytics.client";
import { EChart } from "~/platform/charts/EChart";
import type { ShellHandle } from "~/shell/Shell";
import type { Route } from "./+types/route";
import type { ReportCard as Card } from "~/game-stub/types";
import {
  administratorLine,
  badgeText,
  bossLine,
  foundFooter,
  gradeText,
  heldCourseText,
  measureText,
  moneyShort,
  RESULT_COPY as COPY,
  scoreText,
  seasonNote,
} from "./copy";
import { earnedDiscoveries, type EarnedDiscovery } from "./discoveries.server";
import { OUTCOME_COLORS, outcomeOption } from "./outcome-chart";
import styles from "./Result.module.css";

export const handle: ShellHandle = { title: "Results" };


export function meta({}: Route.MetaArgs) {
  return [{ title: "Q1 2194: the results | Orbital Books" }];
}

export function loader({ request }: Route.LoaderArgs) {
  const outcome = getOutcome(request);
  if (!outcome) throw redirect("/decide");
  // Last year, for the season note and the faint reference line.
  const view = resolveQueryView();
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
  const holdingCourse = outcome.plan.option === "A";
  const { plan, holdCourse } = outcome.totals;

  useEffect(() => {
    track("result_viewed", { option: outcome.plan.option, discoveries: outcome.discoveries.length });
  }, [outcome.plan.option, outcome.discoveries.length]);

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
    track("result_assumptions_opened", { option: outcome.plan.option });
    requestAnimationFrame(() => assumptionsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h2 className={styles.title}>{COPY.title}</h2>
        <div className={styles.score}>
          <span className={styles.scoreHeading}>{COPY.reportCard.combined}</span>
          <span className={styles.scoreLine}>
            {outcome.reportCard.plan.combined.score}
            <span className={styles.grade}>{gradeText(outcome.reportCard.plan.combined.grade)}</span>
          </span>
          {!holdingCourse && (
            <span className={styles.scoreHeading}>
              {heldCourseText(outcome.reportCard.holdCourse.combined.score, outcome.reportCard.holdCourse.combined.grade)}
            </span>
          )}
        </div>
      </header>

      <ReportCard plan={outcome.reportCard.plan} holdCourse={outcome.reportCard.holdCourse} holdingCourse={holdingCourse} />

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

function ReportCard({ plan, holdCourse, holdingCourse }: { plan: Card; holdCourse: Card; holdingCourse: boolean }) {
  const c = COPY.reportCard;
  return (
    <section className={styles.card} aria-labelledby="report-card-heading">
      <h3 id="report-card-heading" className={styles.cardTitle}>
        {c.heading}
      </h3>
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
              return (
                <tr key={m.id}>
                  <th scope="row">{c.measures[m.id]}</th>
                  <td>{measureText(m.id, m.result)}</td>
                  <td>{measureText(m.id, m.lastYear)}</td>
                  <td>{measureText(m.id, m.goal)}</td>
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
      {plan.wellRounded && <p className={styles.award}>{c.wellRounded}</p>}
      <p className={styles.note}>{c.goalsNote}</p>
      <ul className={styles.bosses}>
        <li>
          <span className={styles.boss}>{c.bosses.combined}</span>
          <q className={styles.bossLine}>{administratorLine(plan.combined.score)}</q>
        </li>
        {plan.measures.map((m) => (
          <li key={m.id}>
            <span className={styles.boss}>{c.bosses[m.id]}</span>
            <q className={styles.bossLine}>{bossLine(m)}</q>
          </li>
        ))}
      </ul>
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

