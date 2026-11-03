import { useEffect, useState } from "react";
import { DecideReports } from "~/reports/DecideReports";
import {
  data,
  Link,
  redirect,
  useFetcher,
  useLoaderData,
  useNavigate,
  type ShouldRevalidateFunctionArgs,
} from "react-router";

import {
  currentQuarter,
  getPlan,
  getQuarterBrief,
  submitPlan,
  submitQuarterPlan,
} from "~/game/game.server";
import { compareQuarters, FIRST_QUARTER, type QuarterId } from "~/game/quarters";
import { planOf } from "~/simulation/plan";
import {
  MAX_LEVERS,
  type LeverId,
  type Plan,
  type Q2LeverId,
  type Q2Plan,
} from "~/simulation/types";
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
import { quarterName, type PlanBrief } from "./q2-copy";
import { ForecastRefused, PlanRefused, readAnyPlan } from "./read-plan.server";
import {
  FORECAST_MEASURES,
  forecastMeasures,
  type Forecast,
  type ForecastHints,
  type ForecastProblem,
} from "~/forecast/forecast";
import { forecastHints, forecastResult } from "~/forecast/forecast.server";
import {
  draftProblem,
  EMPTY_FORECAST,
  ForecastSection,
  forecastFields,
  type ForecastDraft,
} from "./ForecastSection";
import styles from "./Decide.module.css";

export const handle: ShellHandle = { title: "Decisions", standingOrder: false, bleed: true };

export function meta({ loaderData }: Route.MetaArgs) {
  return [
    { title: `Plan for ${quarterName(loaderData?.quarter ?? FIRST_QUARTER)} | Orbital Books` },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  // One plan per quarter: once the last one's in, the results are what's left to see.
  const quarter = currentQuarter(request);
  if (!quarter) throw redirect("/result");
  // The player's own forecast's hints (src/forecast): the quarter before's figures and a year earlier's.
  const hints = forecastHints(request);
  if (quarter === FIRST_QUARTER) return { quarter, hints };
  // Every later quarter is planned on Q2's form: the game's brief for it (Frank's getQuarterBrief), with the
  // picker's editions and, from Q3 on, the quarter's event, stretch and strikes (null in Q2 2194, which has none).
  const planned = await getQuarterBrief(request);
  if (!planned) throw redirect("/result");
  return {
    quarter: planned.quarter,
    candidates: planned.candidates,
    brief: planned.brief as PlanBrief | null,
    hints,
  };
}

// After submitting, the loader would redirect straight to the results; the
// play-out does that once the quarter has closed.
export function shouldRevalidate({
  formMethod,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
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
    // A wrong forecast names its field and why, so the browser can say it by the field (src/forecast).
    if (error instanceof ForecastRefused)
      return data(
        {
          ok: false as const,
          played: false,
          problem: "forecast" as const,
          forecastProblem: error.problem,
        },
        { status: 400 },
      );
    if (error instanceof PlanRefused)
      return data(
        { ok: false as const, played: false, problem: "shape" as const },
        { status: error.status },
      );
    throw error;
  }
  return sent.form === "moves"
    ? actionQ1(request, sent.plan, sent.reportsRead, sent.forecast)
    : actionQ2(request, sent.plan, sent.quarter, sent.reportsRead, sent.forecast);
}

/**
 * A forecast filed with a plan: which measures, and whether it had a note; then, as the quarter is played with it,
 * whether each landed inside its range. Never the figures or the note.
 */
function trackForecast(request: Request, quarter: QuarterId, forecast: Forecast | null) {
  if (!forecast) return;
  trackServer("forecast_made", {
    quarter,
    measures: forecastMeasures(forecast).join(","),
    hadNote: forecast.note !== undefined,
  });
  // The plan is filed, so the quarter is played: its figures are in the ledgers. A failure here costs the event only.
  let scored;
  try {
    scored = forecastResult(request, quarter);
  } catch {
    return;
  }
  if (!scored) return;
  const hits: Record<string, "hit" | "miss"> = {};
  for (const measure of FORECAST_MEASURES) {
    const result = scored[measure];
    if (result) hits[measure] = result.where === "inside" ? "hit" : "miss";
  }
  trackServer("forecast_scored", { quarter, ...hits });
}

function actionQ1(request: Request, plan: Plan, reportsRead: number, forecast: Forecast | null) {
  try {
    if (getPlan(request) || currentQuarter(request) !== "2194-Q1")
      return data({ ok: false as const, played: true }, { status: 409 });
    submitPlan(request, plan, forecast);
  } catch (error) {
    // The game refuses with a Response: a lost race to play, a busy or changed save, no
    // save, or storage trouble. The player goes to the results only if a plan is
    // really in (a 409 can also mean a busy save); otherwise back to choosing.
    if (error instanceof Response)
      return data({ ok: false as const, played: hasPlan(request) }, { status: error.status });
    throw error;
  }
  trackServer("plan_submitted", {
    quarter: "2194-Q1",
    levers: planLabel(plan.levers),
    moves: plan.levers.length,
    // The reports chosen in Decide's panel before submitting (reports.md section 5).
    reportsRead,
  });
  trackForecast(request, "2194-Q1", forecast);
  return { ok: true as const };
}

/**
 * Whether the quarter this form was written for has been played, asked again after a refusal: the save has moved
 * past it (or, today, past Q2, the last quarter it plays). False during Q1 (Audit, on #144: a later form sent then
 * would bounce to the results and back), and if the save can't be read.
 */
function laterPlayed(request: Request, asked: QuarterId | null): boolean {
  try {
    const now = currentQuarter(request);
    return (
      now === null || (asked !== null && now !== FIRST_QUARTER && compareQuarters(now, asked) > 0)
    );
  } catch {
    return false;
  }
}

type Q2Problem = "shape" | "unknown-edition" | "same-title";

async function actionQ2(
  request: Request,
  plan: Q2Plan,
  asked: QuarterId,
  reportsRead: number,
  forecast: Forecast | null,
) {
  // A plan is filed only for the quarter its form was written for: the game refuses another quarter's with a 409
  // (Frank's submitQuarterPlan), and a form left open in another tab, sent once the save has moved on, goes to
  // the results (Frank and Audit, #212). From Q3 on, filing waits for the quarter's Alma record.
  try {
    await submitQuarterPlan(request, plan, asked, forecast);
  } catch (error) {
    // A plan the engine refuses (an edition not sold in 2193, one title twice) is a 400 naming why (Frank's
    // game state, from Sim's q2PlanProblem); otherwise as Q1: a lost race, a busy save, storage trouble.
    if (error instanceof Response && error.status === 400) {
      const { problem } = (await error.json().catch(() => ({}))) as { problem?: Q2Problem };
      return data(
        { ok: false as const, played: false, problem: problem ?? ("shape" as const) },
        { status: 400 },
      );
    }
    if (error instanceof Response)
      return data(
        { ok: false as const, played: laterPlayed(request, asked) },
        { status: error.status },
      );
    throw error;
  }
  const picks = plan.picks.filter(Boolean).length;
  trackServer("plan_submitted", {
    quarter: asked,
    levers: planLabel(plan.levers),
    moves: plan.levers.length,
    picks,
    reportsRead,
  });
  trackForecast(request, asked, forecast);
  return { ok: true as const };
}

type Step = "choose" | "confirm" | "playing";

export default function Decide() {
  // Without a loader (the unit tests' stub), it's Q1's plan.
  const loaded = useLoaderData<typeof loader>() as Awaited<ReturnType<typeof loader>> | undefined;
  const hints = loaded?.hints ?? null;
  return loaded?.candidates ? (
    <PlanQ2
      quarter={loaded.quarter}
      candidates={loaded.candidates}
      brief={loaded.brief ?? null}
      hints={hints}
    />
  ) : (
    <PlanQ1 hints={hints} />
  );
}

/** The plan for Q1 2194 (m1-copy section 3): up to two of three moves, on the bosses' requisition form. */
function PlanQ1({ hints }: { hints: ForecastHints | null }) {
  const [chosen, setChosen] = useState<LeverId[]>([]);
  // The player's forecast, filed with the plan if they open it (src/forecast; Plot's section 10).
  const [forecast, setForecast] = useState<ForecastDraft>(EMPTY_FORECAST);
  const [forecastProblem, setForecastProblem] = useState<ForecastProblem | null>(null);
  const [tooMany, setTooMany] = useState(false);
  const [refused, setRefused] = useState(false);
  const [step, setStep] = useState<Step>("choose");
  // The reports read in Decide's panel, by key, for plan_submitted's count.
  const [read, setRead] = useState<ReadonlySet<string>>(new Set());
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
      // A forecast the door refused is said by its field, as the browser's own check says it.
      // The action's own tag; the problem is the shape it sends (src/forecast/forecast.ts).
      if (
        "problem" in fetcher.data &&
        fetcher.data.problem === "forecast" &&
        "forecastProblem" in fetcher.data
      )
        setForecastProblem(fetcher.data.forecastProblem as ForecastProblem);
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
      {/* The player's reports, read beside the plan (reports.md section 4). */}
      <DecideReports
        planStarted={chosen.length > 0}
        quarter={FIRST_QUARTER}
        onRead={(key) => setRead((r) => new Set(r).add(key))}
      />
    </div>
  );
  const form = (
    <div className={styles.requisition}>
      <fieldset
        className={styles.moves}
        disabled={step !== "choose"}
        aria-describedby="moves-rule moves-status"
      >
        <legend className={styles.movesHeading}>{COPY.movesHeading}</legend>
        <p id="moves-rule" className={styles.rule}>
          <FactText line={COPY.rule} />
        </p>
        <div className={styles.options}>
          {MOVES.map((m, i) => (
            <MoveCard
              key={m.id}
              move={m}
              number={i + 1}
              selected={chosen.includes(m.id)}
              onToggle={() => toggle(m.id)}
              line={line}
            />
          ))}
        </div>
        <ForecastSection
          draft={forecast}
          onChange={(next) => {
            setForecast(next);
            setForecastProblem(null);
          }}
          hints={hints}
          problem={forecastProblem}
        />
        <div className={styles.formFoot}>
          <div className={styles.formNotes}>
            {/* What the plan is now, said in words: holding course, or a third move refused. */}
            <p
              id="moves-status"
              className={styles.movesStatus}
              role="status"
              data-warning={tooMany || undefined}
            >
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
              // A forecast that can't be filed is said by its field first, and the plan waits for it.
              const problem = draftProblem(forecast, FIRST_QUARTER);
              setForecastProblem(problem);
              if (problem) return;
              setStep("confirm");
              setTooMany(false);
              setRefused(false);
              track("plan_confirm_opened", {
                levers: planLabel(plan.levers),
                moves: plan.levers.length,
              });
            }}
          >
            {COPY.submit}
          </button>
        </div>
      </fieldset>
      {step === "confirm" && (
        <div
          className={styles.confirm}
          role="alertdialog"
          aria-labelledby="confirm-text"
          aria-describedby="confirm-moves"
        >
          {/* The plan being committed, named: the moves' own titles, or holding course. */}
          <ul id="confirm-moves" className={styles.confirmMoves}>
            {chosenMoves.length === 0 ? (
              <li>{COPY.holdCourse}</li>
            ) : (
              chosenMoves.map((m) => <li key={m.id}>{m.title}</li>)
            )}
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
                fetcher.submit(
                  {
                    levers: plan.levers.join(","),
                    reportsRead: String(read.size),
                    ...forecastFields(forecast),
                  },
                  { method: "post" },
                );
              }}
            >
              {COPY.confirmSubmit}
            </button>
            <Link
              to="/investigate"
              className={styles.secondary}
              onClick={() =>
                track("plan_keep_investigating", {
                  levers: planLabel(plan.levers),
                  moves: plan.levers.length,
                })
              }
            >
              {COPY.keepInvestigating}
            </Link>
          </div>
        </div>
      )}
      {step === "playing" && (
        <div className={styles.cover}>
          <PlayOut
            lines={COPY.playing}
            done={fetcher.state === "idle" && fetcher.data?.ok === true}
          />
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
