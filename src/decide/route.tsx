import { useEffect, useState } from "react";
import { data, Link, redirect, useFetcher, useLoaderData, useNavigate, type ShouldRevalidateFunctionArgs } from "react-router";

import { currentQuarter, getPlan, getQ2Candidates, submitPlan, submitQ2Plan } from "~/game/game.server";
import type { QuarterId } from "~/game/quarters";
import { planOf } from "~/simulation/plan";
import { MAX_LEVERS, type LeverId, type Plan, type Q2LeverId, type Q2Plan } from "~/simulation/types";
import { track } from "~/platform/analytics/analytics.client";
import { trackServer } from "~/platform/analytics/analytics.server";
import type { ShellHandle } from "~/shell/Shell";
import type { Route } from "./+types/route";
import { BossBriefing } from "~/platform/bosses/BossBriefing";
import { BossBanner } from "~/platform/bosses/BossLayout";
import { FactText } from "~/platform/bosses/facts";
import { DECIDE_COPY as COPY, MOVES } from "./copy";
import { MoveCard, useMoreLine } from "./MoveCard";
import { onBubbleFocused, PlayOut, sceneOf } from "./PlanParts";
import { PlanQ2 } from "./PlanQ2";
import { PlanRefused, readAnyPlan } from "./read-plan.server";
import styles from "./Decide.module.css";

export const handle: ShellHandle = { title: "Decisions", standingOrder: false, bleed: true };


export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `Plan for ${loaderData?.quarter === "2194-Q2" ? "Q2" : "Q1"} 2194 | Orbital Books` }];
}

export function loader({ request }: Route.LoaderArgs) {
  // One plan per quarter: once the last one's in, the results are what's left to see.
  const quarter = currentQuarter(request);
  if (!quarter) throw redirect("/result");
  if (quarter === "2194-Q1") return { quarter: "2194-Q1" as const };
  // Q2's picker: every edition sold in 2193 (Sim's list, by title then format), with only what's printed on it.
  return { quarter, candidates: getQ2Candidates() };
}

// After submitting, the loader would redirect straight to the results; the
// play-out does that once the quarter has closed.
export function shouldRevalidate({ formMethod, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
  return formMethod ? false : defaultShouldRevalidate;
}

/** For analytics: the moves by name, a fixed vocabulary ("repick+events", "hold"). */
const planLabel = (levers: readonly (LeverId | Q2LeverId)[]) => levers.join("+") || "hold";

/** Whether the save holds a plan, asked again after a refusal; false if the save can't be read. */
function hasPlan(request: Request): boolean {
  try {
    return getPlan(request) !== null;
  } catch {
    return false;
  }
}

export async function action({ request }: Route.ActionArgs) {
  // The form says which quarter it was written for; the save says which is open now. A Q1 plan sent once the
  // save has moved on (another tab played it) goes to the results; a Q2 plan during Q1 is the game's to refuse.
  let sent: Awaited<ReturnType<typeof readAnyPlan>>;
  try {
    sent = await readAnyPlan(request);
  } catch (error) {
    if (error instanceof PlanRefused) return data({ ok: false as const, played: false, problem: "shape" as const }, { status: error.status });
    throw error;
  }
  return sent.quarter === "2194-Q2" ? actionQ2(request, sent.plan) : actionQ1(request, sent.plan);
}

function actionQ1(request: Request, plan: Plan) {
  try {
    if (getPlan(request) || currentQuarter(request) !== "2194-Q1") return data({ ok: false as const, played: true }, { status: 409 });
    submitPlan(request, plan);
  } catch (error) {
    // The game refuses with a Response: a lost race to play, a busy or changed save, no
    // save, or storage trouble. The player goes to the results only if a plan is
    // really in (a 409 can also mean a busy save); otherwise back to choosing.
    if (error instanceof Response) return data({ ok: false as const, played: hasPlan(request) }, { status: error.status });
    throw error;
  }
  trackServer("plan_submitted", { quarter: "2194-Q1", levers: planLabel(plan.levers), moves: plan.levers.length });
  return { ok: true as const };
}

/**
 * Whether Q2's plan is in, asked again after a refusal: Q2 is the last quarter, so no quarter left to plan.
 * False during Q1 (Audit, on #144: a Q2 form sent then would bounce to the results and back), and if the
 * save can't be read.
 */
function q2Played(request: Request): boolean {
  try {
    return currentQuarter(request) === null;
  } catch {
    return false;
  }
}

type Q2Problem = "shape" | "unknown-edition" | "same-title";

async function actionQ2(request: Request, plan: Q2Plan) {
  try {
    submitQ2Plan(request, plan);
  } catch (error) {
    // A plan the engine refuses (an edition not sold in 2193, one title twice) is a 400 naming why (Frank's
    // game state, from Sim's q2PlanProblem); otherwise as Q1: a lost race, a busy save, storage trouble.
    if (error instanceof Response && error.status === 400) {
      const { problem } = (await error.json().catch(() => ({}))) as { problem?: Q2Problem };
      return data({ ok: false as const, played: false, problem: problem ?? ("shape" as const) }, { status: 400 });
    }
    if (error instanceof Response) return data({ ok: false as const, played: q2Played(request) }, { status: error.status });
    throw error;
  }
  const picks = plan.picks.filter(Boolean).length;
  trackServer("plan_submitted", { quarter: "2194-Q2", levers: planLabel(plan.levers), moves: plan.levers.length, picks });
  return { ok: true as const };
}

type Step = "choose" | "confirm" | "playing";

export default function Decide() {
  // Without a loader (the unit tests' stub), it's Q1's plan.
  const loaded = useLoaderData<typeof loader>() as Awaited<ReturnType<typeof loader>> | undefined;
  return loaded?.quarter === "2194-Q2" ? <PlanQ2 candidates={loaded.candidates} /> : <PlanQ1 />;
}

/** The plan for Q1 2194 (m1-copy section 3): up to two of three moves, on the bosses' requisition form. */
function PlanQ1() {
  const [chosen, setChosen] = useState<LeverId[]>([]);
  const [tooMany, setTooMany] = useState(false);
  const [refused, setRefused] = useState(false);
  const [step, setStep] = useState<Step>("choose");
  const line = useMoreLine();
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

  // The page's half of the banner (David's layout 2): the plan's heading, then the requisition form. The
  // confirmation and the quarter playing out cover the form's boxes in place, so nothing moves.
  const heading = (
    <div className={styles.planHeading}>
      <h2 id="plan-heading" className={styles.memoHeading}>
        {COPY.heading}
      </h2>
      <p className={styles.hint}>{COPY.hint}</p>
    </div>
  );
  const form = (
    <div className={styles.requisition}>
          <fieldset className={styles.moves} disabled={step !== "choose"} aria-describedby="moves-rule moves-status">
            <legend className={styles.movesHeading}>{COPY.movesHeading}</legend>
            <p id="moves-rule" className={styles.rule}>
              <FactText line={COPY.rule} />
            </p>
            <div className={styles.options}>
              {MOVES.map((m, i) => (
                <MoveCard key={m.id} move={m} number={i + 1} selected={chosen.includes(m.id)} onToggle={() => toggle(m.id)} line={line} />
              ))}
            </div>
            <div className={styles.formFoot}>
              <div className={styles.formNotes}>
                {/* What the plan is now, said in words: holding course, or a third move refused. */}
                <p id="moves-status" className={styles.movesStatus} role="status" data-warning={tooMany || undefined}>
                  {tooMany ? COPY.tooMany : chosen.length === 0 ? COPY.holdCourse : ""}
                </p>
                {refused ? (
                  <p className={styles.refused} role="alert">
                    {COPY.notSubmitted}
                  </p>
                ) : (
                  <p className={styles.formFooter}>{COPY.form.footer}</p>
                )}
              </div>
              {/* The form's chrome: who issued it and its serial. Decoration; the legend names the form. */}
              <div className={styles.formMeta} aria-hidden="true">
                {COPY.form.issuer.map((line) => (
                  <span key={line}>{line}</span>
                ))}
                <span className={styles.serial}>
                  <span className={styles.barcode} />
                  {COPY.form.serial}
                </span>
              </div>
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
            </div>
          </fieldset>
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
      {step === "playing" && (
        <div className={styles.cover}>
          <PlayOut lines={COPY.playing} done={fetcher.state === "idle" && fetcher.data?.ok === true} />
        </div>
      )}
    </div>
  );

  return (
    <div className={styles.page}>
      {/* The brief, from the bosses together (m1-copy section 3), and the plan, in one scene. */}
      <section className={styles.briefing} aria-labelledby="plan-heading">
        <BossBanner.Provider value={{ heading, form }}>
          <BossBriefing bubbles={Q1_SCENE} onFocus={onBubbleFocused} />
        </BossBanner.Provider>
      </section>
    </div>
  );
}

const Q1_SCENE = sceneOf(COPY.briefing);
