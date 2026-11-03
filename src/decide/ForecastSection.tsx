import { useId } from "react";

import {
  FORECAST_FIELDS,
  FORECAST_MEASURES,
  forecastFromForm,
  type ForecastHint,
  type ForecastHints,
  type ForecastMeasure,
  type ForecastProblem,
} from "~/forecast/forecast";
import { formatMeasure } from "~/investigate/format";
import type { QuarterId } from "~/simulation/quarters";
import { quarterName } from "./q2-copy";
import { FORECAST_COPY as COPY } from "./forecast-copy";
import styles from "./Decide.module.css";

// The player's own forecast, filed with the plan (David, 3 Nov 2026, req_6d136a2b7fb3; Plot's copy, section 10).
// Optional: closed, it's a button, and closed is the skip. Open, each of revenue and units sold takes an expected
// figure and an 80% range, with the quarter before's and a year earlier's figures beside it as hints, and the note
// takes why. Nothing is pre-filled. What's sent is Frank's three form fields (src/forecast/forecast.ts), checked in
// the browser by his own forecastFromForm before the plan goes.

/** One measure's three fields, as typed. */
export interface Entry {
  point: string;
  low: string;
  high: string;
}
export interface ForecastDraft {
  open: boolean;
  revenue: Entry;
  units: Entry;
  note: string;
}
const EMPTY_ENTRY: Entry = { point: "", low: "", high: "" };
export const EMPTY_FORECAST: ForecastDraft = {
  open: false,
  revenue: EMPTY_ENTRY,
  units: EMPTY_ENTRY,
  note: "",
};

/**
 * The form fields the plan is sent with (Frank's FORECAST_FIELDS): none while closed, none for a measure left empty,
 * and each measure's three figures as typed, joined `point,low,high`. Thousands separators come out first, since the
 * field's own separator is the comma.
 */
export function forecastFields(draft: ForecastDraft): Record<string, string> {
  if (!draft.open) return {};
  const fields: Record<string, string> = {};
  for (const measure of FORECAST_MEASURES) {
    const parts = [draft[measure].point, draft[measure].low, draft[measure].high].map((t) =>
      t.trim().replace(/,/g, ""),
    );
    if (parts.some((p) => p !== "")) fields[FORECAST_FIELDS[measure]] = parts.join(",");
  }
  if (draft.note.trim()) fields[FORECAST_FIELDS.note] = draft.note;
  return fields;
}

/**
 * The first problem in what would be sent, by the same check the server makes (Frank's forecastFromForm), so the
 * browser and the door always agree; null when it can be filed. A closed draft has none.
 */
export function draftProblem(draft: ForecastDraft, quarter: QuarterId): ForecastProblem | null {
  const fields = forecastFields(draft);
  const checked = forecastFromForm(quarter, (name) => fields[name] ?? null);
  return checked.ok ? null : checked.problem;
}

const hintValue = (measure: ForecastMeasure, hint: ForecastHint) =>
  hint.value === null ? null : formatMeasure(measure, hint.value);

export function ForecastSection({
  draft,
  onChange,
  hints,
  problem,
}: {
  draft: ForecastDraft;
  onChange: (draft: ForecastDraft) => void;
  /** The quarter before's and a year earlier's figures; null when the game has none to give. */
  hints: ForecastHints | null;
  /** The problem to show by its field: the browser's own check, or the server's refusal. */
  problem: ForecastProblem | null;
}) {
  const id = useId();
  const problemId = `${id}-problem`;
  const set = (measure: ForecastMeasure, part: keyof Entry, value: string) =>
    onChange({ ...draft, [measure]: { ...draft[measure], [part]: value } });

  if (!draft.open)
    return (
      <div className={styles.forecastClosed}>
        <span className={styles.forecastHeading}>{COPY.heading}</span>
        <button
          type="button"
          className={styles.forecastToggle}
          aria-expanded={false}
          onClick={() => onChange({ ...draft, open: true })}
        >
          {COPY.add}
        </button>
      </div>
    );

  const said = (field: ForecastProblem["field"]) =>
    problem?.field === field ? COPY.problems[problem.reason](field as ForecastMeasure) : null;

  return (
    <fieldset id={`${id}-body`} className={styles.forecast}>
      <legend className={styles.forecastHeading}>{COPY.heading}</legend>
      <button
        type="button"
        className={styles.forecastToggle}
        aria-expanded={true}
        aria-controls={`${id}-body`}
        // Removing it is the skip: what was typed goes with it, so nothing half-done is filed.
        onClick={() => onChange(EMPTY_FORECAST)}
      >
        {COPY.remove}
      </button>
      <p className={styles.forecastExplain}>{COPY.explain}</p>
      <div className={styles.forecastMeasures}>
        {FORECAST_MEASURES.map((measure) => {
          const names = COPY.names(measure);
          const entry = draft[measure];
          const error = said(measure);
          const hintId = `${id}-${measure}-hints`;
          const describedBy = [hintId, error ? problemId : null].filter(Boolean).join(" ");
          const field = (part: keyof Entry, label: string, name: string) => (
            <label className={styles.forecastField}>
              <span aria-hidden="true">{label}</span>
              <input
                type="text"
                inputMode={measure === "units" ? "numeric" : "decimal"}
                autoComplete="off"
                aria-label={name}
                aria-describedby={describedBy}
                aria-invalid={error ? true : undefined}
                value={entry[part]}
                onChange={(e) => set(measure, part, e.target.value)}
              />
            </label>
          );
          return (
            <div key={measure} className={styles.forecastMeasure}>
              <span className={styles.forecastMeasureName}>{COPY.measures[measure]}</span>
              <div className={styles.forecastRow}>
                {field("point", COPY.expected, names.point)}
                <span className={styles.forecastRange} aria-hidden="true">
                  {COPY.range}
                </span>
                {field("low", COPY.from, names.low)}
                {field("high", COPY.to, names.high)}
              </div>
              <ul id={hintId} className={styles.forecastHints}>
                {hints && (
                  <>
                    <li>
                      {COPY.hintBefore(
                        quarterName(hints[measure].previous.quarter),
                        hintValue(measure, hints[measure].previous),
                      )}
                    </li>
                    <li>
                      {COPY.hintYearEarlier(
                        quarterName(hints[measure].yearEarlier.quarter),
                        hintValue(measure, hints[measure].yearEarlier),
                      )}
                    </li>
                  </>
                )}
              </ul>
              {error && (
                <p id={problemId} className={styles.forecastProblem} role="alert">
                  {error}
                </p>
              )}
            </div>
          );
        })}
      </div>
      <label className={styles.forecastNote}>
        <span>{COPY.note}</span>
        <textarea
          rows={2}
          placeholder={COPY.notePlaceholder}
          aria-describedby={said("note") ? problemId : undefined}
          aria-invalid={said("note") ? true : undefined}
          value={draft.note}
          onChange={(e) => onChange({ ...draft, note: e.target.value })}
        />
      </label>
      {said("note") && (
        <p id={problemId} className={styles.forecastProblem} role="alert">
          {said("note")}
        </p>
      )}
    </fieldset>
  );
}
