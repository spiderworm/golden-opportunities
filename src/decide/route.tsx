import { useEffect, useState } from "react";
import { data, Link, redirect, useFetcher, useNavigate, type ShouldRevalidateFunctionArgs } from "react-router";

import { getPlan, submitPlan } from "~/game-stub/game.server";
import { planOf } from "~/simulation/plan";
import { MAX_LEVERS, type LeverId, type Plan } from "~/simulation/types";
import { track } from "~/platform/analytics/analytics.client";
import { trackServer } from "~/platform/analytics/analytics.server";
import type { ShellHandle } from "~/shell/Shell";
import type { Route } from "./+types/route";
import { DECIDE_COPY as COPY, MOVES } from "./copy";
import { PlanRefused, readPlan } from "./read-plan.server";
import styles from "./Decide.module.css";

export const handle: ShellHandle = { title: "Decisions" };

const MONTH_MS = 900;

export function meta({}: Route.MetaArgs) {
  return [{ title: "Plan for Q1 2194 | Orbital Books" }];
}

export function loader({ request }: Route.LoaderArgs) {
  // One plan per quarter: once it's in, the results are what's left to see.
  if (getPlan(request)) throw redirect("/result");
  return null;
}

// After submitting, the loader would redirect straight to the results; the
// play-out does that once the quarter has closed.
export function shouldRevalidate({ formMethod, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
  return formMethod ? false : defaultShouldRevalidate;
}

/** For analytics: the moves by name, a fixed vocabulary ("repick+events", "hold"). */
const planLabel = (levers: readonly LeverId[]) => levers.join("+") || "hold";

export async function action({ request }: Route.ActionArgs) {
  let plan: Plan;
  try {
    plan = await readPlan(request);
  } catch (error) {
    if (error instanceof PlanRefused) return data({ ok: false as const }, { status: error.status });
    throw error;
  }
  if (getPlan(request)) return data({ ok: false as const }, { status: 409 });
  submitPlan(request, plan);
  trackServer("plan_submitted", { levers: planLabel(plan.levers), moves: plan.levers.length });
  return { ok: true as const };
}

type Step = "choose" | "confirm" | "playing";

export default function Decide() {
  const [chosen, setChosen] = useState<LeverId[]>([]);
  const [tooMany, setTooMany] = useState(false);
  const [step, setStep] = useState<Step>("choose");
  // In LEVER_IDS order, whatever order they were ticked in.
  const plan = planOf(chosen) ?? { levers: [] };
  const chosenMoves = MOVES.filter((m) => plan.levers.includes(m.id));

  function toggle(lever: LeverId) {
    if (chosen.includes(lever)) {
      setChosen(chosen.filter((l) => l !== lever));
      setTooMany(false);
      track("plan_move_toggled", { lever, chosen: false, moves: chosen.length - 1 });
    } else if (chosen.length >= MAX_LEVERS) {
      setTooMany(true);
      track("plan_move_refused", { lever });
    } else {
      setChosen([...chosen, lever]);
      track("plan_move_toggled", { lever, chosen: true, moves: chosen.length + 1 });
    }
  }
  const fetcher = useFetcher<typeof action>();

  // A plan the server refused (already submitted, or not a valid plan) goes back to choosing.
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok === false) setStep("choose");
  }, [fetcher.state, fetcher.data]);

  return (
    <div className={styles.page}>
      <article className={styles.memo} aria-labelledby="plan-heading">
        <header className={styles.memoHeader}>
          <h2 id="plan-heading" className={styles.memoHeading}>
            {COPY.heading}
          </h2>
          {COPY.intro.map((line, i) => (
            <p key={line} className={i === 0 ? styles.goal : styles.rule}>
              {line}
            </p>
          ))}
        </header>

        <div className={styles.briefing}>
          <section aria-labelledby="rules-heading">
            <h3 id="rules-heading" className={styles.subheading}>
              {COPY.rulesHeading}
            </h3>
            <ul className={styles.list}>
              {COPY.rules.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="scheduled-heading">
            <h3 id="scheduled-heading" className={styles.subheading}>
              {COPY.scheduledHeading}
            </h3>
            <p className={styles.listIntro}>{COPY.scheduledIntro}</p>
            <ul className={styles.list}>
              {COPY.scheduled.map((pick) => (
                <li key={pick.month}>
                  {pick.month}: <cite className={styles.bookTitle}>{pick.title}</cite> ({pick.format})
                </li>
              ))}
            </ul>
          </section>
        </div>
      </article>

      <fieldset className={styles.moves} disabled={step !== "choose"} aria-describedby="moves-status">
        <legend className={styles.movesHeading}>{COPY.movesHeading}</legend>
        <div className={styles.options}>
          {MOVES.map((m) => {
            const selected = chosen.includes(m.id);
            return (
              <label key={m.id} className={styles.option} data-selected={selected || undefined}>
                <input type="checkbox" name="levers" value={m.id} checked={selected} onChange={() => toggle(m.id)} />
                <span className={styles.optionTitle}>{m.title}</span>
                <span className={styles.optionLine}>{m.line}</span>
              </label>
            );
          })}
        </div>
        {/* What the plan is now, said in words: holding course, or a third move refused. */}
        <p id="moves-status" className={styles.movesStatus} role="status" data-warning={tooMany || undefined}>
          {tooMany ? COPY.tooMany : chosen.length === 0 ? COPY.holdCourse : ""}
        </p>
      </fieldset>

      {step === "choose" && (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primary}
            onClick={() => {
              setStep("confirm");
              setTooMany(false);
              track("plan_confirm_opened", { levers: planLabel(plan.levers), moves: plan.levers.length });
            }}
          >
            {COPY.submit}
          </button>
        </div>
      )}

      {step === "confirm" && (
        <div className={styles.confirm} role="alertdialog" aria-labelledby="confirm-text" aria-describedby="confirm-moves">
          {/* The plan being committed, named: the moves' own titles, or holding course. */}
          <ul id="confirm-moves" className={styles.confirmMoves}>
            {chosenMoves.length === 0 ? <li>{COPY.holdCourse}</li> : chosenMoves.map((m) => <li key={m.id}>{m.title}</li>)}
          </ul>
          <p id="confirm-text" className={styles.confirmText}>
            {COPY.confirm}
          </p>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.primary}
              autoFocus
              onClick={() => {
                setStep("playing");
                fetcher.submit({ levers: plan.levers.join(",") }, { method: "post" });
              }}
            >
              {COPY.confirmSubmit}
            </button>
            <Link
              to="/investigate"
              className={styles.secondary}
              onClick={() => track("plan_keep_investigating", { levers: planLabel(plan.levers), moves: plan.levers.length })}
            >
              {COPY.keepInvestigating}
            </Link>
          </div>
        </div>
      )}

      {step === "playing" && <PlayOut done={fetcher.state === "idle" && fetcher.data?.ok === true} />}
    </div>
  );
}

/** January... February... March..., then the quarter closes and the results open. */
function PlayOut({ done }: { done: boolean }) {
  const [shown, setShown] = useState(1);
  const navigate = useNavigate();
  const lines = [...COPY.playing, COPY.closed];
  const closed = shown >= lines.length;

  useEffect(() => {
    if (shown < COPY.playing.length || (shown === COPY.playing.length && done)) {
      const timer = setTimeout(() => setShown(shown + 1), MONTH_MS);
      return () => clearTimeout(timer);
    }
  }, [shown, done]);

  useEffect(() => {
    if (!closed) return;
    const timer = setTimeout(() => navigate("/result"), MONTH_MS);
    return () => clearTimeout(timer);
  }, [closed, navigate]);

  return (
    <div className={styles.playout} role="status" aria-live="polite">
      {lines.slice(0, shown).map((line, i) => (
        <p key={line} className={i === lines.length - 1 ? styles.closed : styles.month}>
          {line}
        </p>
      ))}
    </div>
  );
}
