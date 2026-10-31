import { useEffect, useState } from "react";
import { data, Link, redirect, useFetcher, useNavigate, type ShouldRevalidateFunctionArgs } from "react-router";

import { getPlan, submitPlan } from "~/game/game.server";
import { planOf } from "~/simulation/plan";
import { MAX_LEVERS, type LeverId, type Plan } from "~/simulation/types";
import { track } from "~/platform/analytics/analytics.client";
import { trackServer } from "~/platform/analytics/analytics.server";
import type { ShellHandle } from "~/shell/Shell";
import type { Route } from "./+types/route";
import { BossBriefing } from "~/platform/bosses/BossBriefing";
import { FactText } from "~/platform/bosses/facts";
import type { BossId } from "~/platform/bosses/bosses";
import type { FocusHow, SceneMode } from "~/platform/bosses/useBossFocus";
import { DECIDE_COPY as COPY, MOVES, type BriefingBubble } from "./copy";
import { PlanRefused, readPlan } from "./read-plan.server";
import styles from "./Decide.module.css";

export const handle: ShellHandle = { title: "Decisions", standingOrder: false };

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

/** Whether the save holds a plan, asked again after a refusal; false if the save can't be read. */
function hasPlan(request: Request): boolean {
  try {
    return getPlan(request) !== null;
  } catch {
    return false;
  }
}

export async function action({ request }: Route.ActionArgs) {
  let plan: Plan;
  try {
    plan = await readPlan(request);
  } catch (error) {
    if (error instanceof PlanRefused) return data({ ok: false as const, played: false }, { status: error.status });
    throw error;
  }
  try {
    if (getPlan(request)) return data({ ok: false as const, played: true }, { status: 409 });
    submitPlan(request, plan);
  } catch (error) {
    // The game refuses with a Response: a lost race to play, a busy or changed save, no
    // save, or storage trouble. The player goes to the results only if a plan is
    // really in (a 409 can also mean a busy save); otherwise back to choosing.
    if (error instanceof Response) return data({ ok: false as const, played: hasPlan(request) }, { status: error.status });
    throw error;
  }
  trackServer("plan_submitted", { levers: planLabel(plan.levers), moves: plan.levers.length });
  return { ok: true as const };
}

type Step = "choose" | "confirm" | "playing";

export default function Decide() {
  const [chosen, setChosen] = useState<LeverId[]>([]);
  const [tooMany, setTooMany] = useState(false);
  const [refused, setRefused] = useState(false);
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

  const navigate = useNavigate();

  // A plan the server refused goes back to choosing; if the quarter has already
  // been played (say, from another tab), its results are what's left to see.
  useEffect(() => {
    if (fetcher.state !== "idle" || fetcher.data?.ok !== false) return;
    if (fetcher.data.played) navigate("/result");
    else {
      setStep("choose");
      setRefused(true);
    }
  }, [fetcher.state, fetcher.data, navigate]);

  return (
    <div className={styles.page}>
      {/* The brief, from the bosses together (m1-copy section 3): one bubble open at a time, the Administrator's first. */}
      <section className={styles.briefing} aria-labelledby="plan-heading">
        <div>
          <h2 id="plan-heading" className={styles.memoHeading}>
            {COPY.heading}
          </h2>
          <p className={styles.hint}>{COPY.hint}</p>
        </div>
        <BossBriefing bubbles={SCENE} onFocus={onBubbleFocused} />
      </section>

      <fieldset className={styles.moves} disabled={step !== "choose"} aria-describedby="moves-rule moves-status">
        <legend className={styles.movesHeading}>{COPY.movesHeading}</legend>
        <p id="moves-rule" className={styles.rule}>
          <FactText line={COPY.rule} />
        </p>
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
              setRefused(false);
              track("plan_confirm_opened", { levers: planLabel(plan.levers), moves: plan.levers.length });
            }}
          >
            {COPY.submit}
          </button>
          {refused && (
            <p className={styles.refused} role="alert">
              {COPY.notSubmitted}
            </p>
          )}
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

/** The scene's bubbles, in Plot's order: teaser, full line and fact strip for each boss. */
const SCENE = COPY.briefing.map((b) => ({ boss: b.boss, teaser: b.teaser, line: b.line, facts: <Facts bubble={b} /> }));

function onBubbleFocused(boss: BossId, how: FocusHow, mode: SceneMode) {
  track("bubble_focused", { boss, how, mode });
}

/** A bubble's fact strip: its sentence, with the key figures in bold, and bubble 6's scheduled picks. */
function Facts({ bubble }: { bubble: BriefingBubble }) {
  return (
    <>
      <p>
        <FactText line={bubble.facts} />
      </p>
      {bubble.picks && (
        <ul>
          {COPY.scheduled.map((pick) => (
            <li key={pick.month}>
              <strong>{pick.month}</strong> <cite className={styles.bookTitle}>{pick.title}</cite> ({pick.format})
            </li>
          ))}
        </ul>
      )}
    </>
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
