import { useEffect, useState } from "react";
import { data, Link, redirect, useFetcher, useNavigate, type ShouldRevalidateFunctionArgs } from "react-router";

import { getPlan, submitPlan } from "~/game-stub/game.server";
import type { OptionId } from "~/game-stub/types";
import { track } from "~/platform/analytics/analytics.client";
import { trackServer } from "~/platform/analytics/analytics.server";
import type { ShellHandle } from "~/shell/Shell";
import type { Route } from "./+types/route";
import { DECIDE_COPY as COPY, OPTIONS } from "./copy";
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

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const option = form.get("option");
  if (typeof option !== "string" || !OPTIONS.some((o) => o.id === option)) {
    return data({ ok: false as const }, { status: 400 });
  }
  if (getPlan(request)) return data({ ok: false as const }, { status: 409 });
  submitPlan(request, { option: option as OptionId });
  trackServer("plan_submitted", { option });
  return { ok: true as const };
}

type Step = "choose" | "confirm" | "playing";

export default function Decide() {
  const [option, setOption] = useState<OptionId | null>(null);
  const [step, setStep] = useState<Step>("choose");
  const fetcher = useFetcher<typeof action>();

  // A plan the server refused (already submitted, or not an option) goes back to choosing.
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
          <p className={styles.goal}>{COPY.goal}</p>
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

      <fieldset className={styles.options} disabled={step !== "choose"}>
        <legend className={styles.visuallyHidden}>Choose one option</legend>
        {OPTIONS.map((o) => (
          <label key={o.id} className={styles.option} data-selected={option === o.id || undefined}>
            <input
              type="radio"
              name="option"
              value={o.id}
              checked={option === o.id}
              onChange={() => {
                setOption(o.id);
                track("plan_option_selected", { option: o.id });
              }}
            />
            <span className={styles.optionTitle}>{o.title}</span>
            <span className={styles.optionLine}>{o.line}</span>
          </label>
        ))}
      </fieldset>

      {step === "choose" && (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primary}
            disabled={!option}
            onClick={() => {
              setStep("confirm");
              track("plan_confirm_opened", { option: option! });
            }}
          >
            {COPY.submit}
          </button>
        </div>
      )}

      {step === "confirm" && option && (
        <div className={styles.confirm} role="alertdialog" aria-labelledby="confirm-text">
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
                fetcher.submit({ option }, { method: "post" });
              }}
            >
              {COPY.confirmSubmit}
            </button>
            <Link to="/investigate" className={styles.secondary} onClick={() => track("plan_keep_investigating", { option })}>
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
