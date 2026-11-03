import { useEffect, useMemo, useState } from "react";
import { DecideReports } from "~/reports/DecideReports";
import { Link, useFetcher, useNavigate } from "react-router";

import { track } from "~/platform/analytics/analytics.client";
import { BossBriefing } from "~/platform/bosses/BossBriefing";
import { BossBanner } from "~/platform/bosses/BossLayout";
import { FactText } from "~/platform/bosses/facts";
import type { Q2LeverId } from "~/simulation/types";
import { MoveCard, useMoreLine } from "./MoveCard";
import { PickPicker, type Candidate } from "./PickPicker";
import type { ForecastHints, ForecastProblem } from "~/forecast/forecast";
import {
  draftProblem,
  EMPTY_FORECAST,
  ForecastSection,
  forecastFields,
  type ForecastDraft,
} from "./ForecastSection";
import { onBubbleFocused, PlayOut, sceneOf } from "./PlanParts";
import type { QuarterId } from "~/simulation/quarters";
import {
  DECIDE_COPY as COPY,
  DECIDE_Q2_COPY as Q2,
  editionLabel,
  planCopy,
  type PlanBrief,
} from "./q2-copy";
import styles from "./Decide.module.css";

/** What the Q2 action answers: Frank's shapes, with the engine's reason when it refuses a plan. */
export type Q2ActionData =
  | { ok: true }
  | { ok: false; played: boolean; problem?: "shape" | "unknown-edition" | "same-title" }
  // A forecast the door refused, by its field (src/forecast; Frank's #384).
  | { ok: false; played: false; problem: "forecast"; forecastProblem: ForecastProblem };

type Step = "choose" | "confirm" | "playing";

/** For analytics: how many months have a pick, and the other move by name ("events", or "none"). */
const planProps = (picks: readonly (string | null)[], lever: Q2LeverId | null) => ({
  picks: picks.filter(Boolean).length,
  move: lever ?? "none",
});

/**
 * The plan for any quarter after Q1, Q2 2194's form (q2.md section 5; endless.md section 4): a Book of the Month
 * for each of its months, or none, and up to one more move, on the same requisition form in the same scene as
 * Q1's. Its months, heading, serial, brief and play-out come from the quarter (planCopy).
 */
export function PlanQ2({
  quarter,
  candidates,
  brief = null,
  hints = null,
}: {
  quarter: QuarterId;
  candidates: readonly Candidate[];
  brief?: PlanBrief | null;
  /** The player's forecast's hints (src/forecast): the quarter before's figures and a year earlier's. */
  hints?: ForecastHints | null;
}) {
  const plan = useMemo(() => planCopy(quarter, brief), [quarter, brief]);
  const scene = useMemo(() => sceneOf(plan.briefing), [plan]);
  const MONTHS = plan.months;
  const [picks, setPicks] = useState<(string | null)[]>([null, null, null]);
  const [lever, setLever] = useState<Q2LeverId | null>(null);
  const [tooMany, setTooMany] = useState(false);
  const [refused, setRefused] = useState(false);
  // The player's forecast, filed with the plan if they open it (src/forecast; Plot's section 10).
  const [forecast, setForecast] = useState<ForecastDraft>(EMPTY_FORECAST);
  const [forecastProblem, setForecastProblem] = useState<ForecastProblem | null>(null);
  const [step, setStep] = useState<Step>("choose");
  // The reports read in Decide's panel, by key, for plan_submitted's count.
  const [read, setRead] = useState<ReadonlySet<string>>(new Set());
  const line = useMoreLine();
  const fetcher = useFetcher<Q2ActionData>();
  const navigate = useNavigate();
  const byIsbn = useMemo(() => new Map(candidates.map((c) => [c.isbn, c])), [candidates]);
  const holding = picks.every((p) => p === null) && lever === null;

  function toggle(id: Q2LeverId) {
    if (lever === id) {
      setLever(null);
      setTooMany(false);
      track("plan_move_toggled", { lever: id, chosen: false, moves: 0 });
    } else if (lever) {
      setTooMany(true);
      track("plan_move_refused", { lever: id });
    } else {
      setLever(id);
      track("plan_move_toggled", { lever: id, chosen: true, moves: 1 });
    }
  }

  // A plan the server refused goes back to choosing; if the quarter has already
  // been played (say, from another tab), its results are what's left to see.
  useEffect(() => {
    if (fetcher.state !== "idle" || fetcher.data?.ok !== false) return;
    if (fetcher.data.played) navigate("/result");
    else {
      setStep("choose");
      setRefused(true);
      // A forecast the door refused is said by its field, as the browser's own check says it.
      if (fetcher.data.problem === "forecast") setForecastProblem(fetcher.data.forecastProblem);
    }
  }, [fetcher.state, fetcher.data, navigate]);

  const heading = (
    <div className={styles.planHeading}>
      <h2 id="plan-heading" className={styles.memoHeading}>
        {plan.heading}
      </h2>
      <p className={styles.hint}>{COPY.hint}</p>
      {/* The player's reports, read beside the plan (reports.md section 4). */}
      <DecideReports
        planStarted={!holding}
        quarter={quarter}
        onRead={(key) => setRead((r) => new Set(r).add(key))}
      />
    </div>
  );
  const chosenMove = plan.moves.find((m) => m.id === lever);
  const form = (
    <div className={styles.requisition}>
      <fieldset
        className={styles.moves}
        disabled={step !== "choose"}
        aria-describedby="moves-rule moves-status"
      >
        <legend className={styles.movesHeading}>{Q2.movesHeading}</legend>
        <p id="moves-rule" className={styles.rule}>
          <FactText line={COPY.rule} />
        </p>
        <div className={styles.q2Body}>
          <PickPicker
            candidates={candidates}
            months={plan.months}
            picks={picks}
            disabled={step !== "choose"}
            onPick={(month, isbn) => {
              const next = picks.map((p, m) => (m === month ? isbn : p));
              setPicks(next);
              track("plan_pick_changed", {
                month: MONTHS[month]!,
                picked: isbn !== null,
                picks: next.filter(Boolean).length,
              });
            }}
            onRefused={(month) => track("plan_pick_refused", { month: MONTHS[month]! })}
          />
          <div className={styles.oneMore} role="group" aria-labelledby="one-more-label">
            <p id="one-more-label" className={styles.sectionLabel}>
              {Q2.moreLabel}
            </p>
            {plan.moves.map((m, i) => (
              <MoveCard
                key={m.id}
                move={m}
                number={i + 1}
                selected={lever === m.id}
                onToggle={() => toggle(m.id)}
                line={line}
              />
            ))}
          </div>
        </div>
        <ForecastSection
          draft={forecast}
          onChange={(next) => {
            setForecast(next);
            setForecastProblem(null);
          }}
          hints={hints}
          problem={forecastProblem}
          quarter={quarter}
        />
        <div className={styles.formFoot}>
          <div className={styles.formNotes}>
            <p
              id="moves-status"
              className={styles.movesStatus}
              role="status"
              data-warning={tooMany || undefined}
            >
              {tooMany ? Q2.tooMany : holding ? Q2.holdCourse : ""}
            </p>
            {refused ? (
              <p className={styles.refused} role="alert">
                {COPY.notSubmitted}
              </p>
            ) : (
              <p className={styles.formFooter}>{Q2.form.footer}</p>
            )}
          </div>
          <div className={styles.formMeta} aria-hidden="true">
            {COPY.form.issuer.map((l) => (
              <span key={l}>{l}</span>
            ))}
            <span className={styles.serial}>
              <span className={styles.barcode} />
              {plan.serial}
            </span>
          </div>
          <button
            type="button"
            className={styles.primary}
            onClick={() => {
              // A forecast that can't be filed is said by its field first, and the plan waits for it.
              const problem = draftProblem(forecast, quarter);
              setForecastProblem(problem);
              if (problem) return;
              setStep("confirm");
              setTooMany(false);
              setRefused(false);
              track("plan_confirm_opened", planProps(picks, lever));
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
          {/* The plan being committed, named: each month's pick and the other move, or holding course. */}
          <ul id="confirm-moves" className={styles.confirmMoves}>
            {holding ? (
              <li>{Q2.holdCourse}</li>
            ) : (
              <>
                {picks.map((isbn, m) => {
                  const pick = isbn ? byIsbn.get(isbn) : undefined;
                  return (
                    pick && (
                      <li key={m}>
                        {MONTHS[m]}: {editionLabel(pick)}
                      </li>
                    )
                  );
                })}
                {chosenMove && <li>{chosenMove.title}</li>}
              </>
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
                    picks: picks.map((p) => p ?? "").join(","),
                    levers: lever ?? "",
                    quarter,
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
              onClick={() => track("plan_keep_investigating", planProps(picks, lever))}
            >
              {COPY.keepInvestigating}
            </Link>
          </div>
        </div>
      )}
      {step === "playing" && (
        <div className={styles.cover}>
          <PlayOut
            lines={plan.playing}
            done={fetcher.state === "idle" && fetcher.data?.ok === true}
          />
        </div>
      )}
    </div>
  );

  return (
    <div className={styles.page}>
      <section className={styles.briefing} aria-labelledby="plan-heading">
        <BossBanner.Provider value={{ heading, form }}>
          <BossBriefing bubbles={scene} onFocus={onBubbleFocused} />
        </BossBanner.Provider>
      </section>
    </div>
  );
}
