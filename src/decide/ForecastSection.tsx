import { useId } from "react";

import type { QuarterId } from "~/game/quarters";
import { formatMeasure } from "~/investigate/format";
import { quarterName } from "./q2-copy";
import { FORECAST_COPY as COPY, NOTE_MAX, type ForecastMeasure } from "./forecast-copy";
import styles from "./Decide.module.css";

// The player's own forecast, filed with the plan (David, 3 Nov 2026, req_6d136a2b7fb3; Plot's copy, section 10).
// Optional: closed, it's a button, and closed is the skip. Open, each of revenue and units sold takes an expected
// figure and an 80% range, with the quarter before's and a year earlier's figures beside it as hints, and the note
// takes why. Nothing is pre-filled. What's sent is three form fields (Frank's shape): `forecastRevenue` and
// `forecastUnits` as "point,low,high", and `forecastNote`; a measure left empty is left out.

export const MEASURES: readonly ForecastMeasure[] = ["revenue", "units"];

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

/** The figures beside a measure (Frank's ForecastHints): a quarter, and its value, or null when not in the ledgers. */
export interface Hint {
  quarter: QuarterId;
  value: number | null;
}
export interface ForecastHints {
  quarter: QuarterId;
  revenue: { previous: Hint; yearEarlier: Hint };
  units: { previous: Hint; yearEarlier: Hint };
}

/** Why a field can't be filed (Frank's reasons), or none. */
export type ForecastReason = keyof typeof COPY.problems;
export interface ForecastProblem {
  field: ForecastMeasure | "note";
  reason: ForecastReason;
}

/** A typed amount as a number: "$140,000" and "140000" alike; null when it isn't one. */
export function parseAmount(text: string): number | null {
  const plain = text.replace(/[$,\s]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(plain)) return null;
  return Number(plain);
}

/**
 * Why one measure's entry can't be filed, or null if it can (empty is fine: not forecast). The browser's own check,
 * so the player hears it before the plan goes; the server checks again (Frank's checkForecastField).
 */
export function entryProblem(measure: ForecastMeasure, entry: Entry): ForecastReason | null {
  const typed = [entry.point, entry.low, entry.high].map((t) => t.trim());
  if (typed.every((t) => t === "")) return null;
  if (typed.some((t) => t === "")) return "partial";
  const [point, low, high] = typed.map(parseAmount);
  if (point === null || low === null || high === null) return "number";
  if (point < 0 || low < 0 || high < 0) return "negative";
  if (measure === "units" && ![point, low, high].every(Number.isInteger)) return "number";
  if (low > point) return "low_above_point";
  if (point > high) return "point_above_high";
  return null;
}

export function noteProblem(note: string): ForecastReason | null {
  return note.length > NOTE_MAX ? "too_long" : null;
}

/** The first problem in the draft, in the form's order, or null. A closed draft has none. */
export function draftProblem(draft: ForecastDraft): ForecastProblem | null {
  if (!draft.open) return null;
  for (const measure of MEASURES) {
    const reason = entryProblem(measure, draft[measure]);
    if (reason) return { field: measure, reason };
  }
  const reason = noteProblem(draft.note);
  return reason ? { field: "note", reason } : null;
}

/** The form fields the plan is sent with: none while closed, and none for a measure left empty. */
export function forecastFields(draft: ForecastDraft): Record<string, string> {
  if (!draft.open) return {};
  const fields: Record<string, string> = {};
  for (const measure of MEASURES) {
    const { point, low, high } = draft[measure];
    const values = [point, low, high].map(parseAmount);
    if (values.every((v) => v !== null))
      fields[measure === "revenue" ? "forecastRevenue" : "forecastUnits"] = values.join(",");
  }
  if (draft.note.trim()) fields.forecastNote = draft.note.trim();
  return fields;
}

/** The measures forecast, for analytics: "revenue+units", "revenue", or "" for none. Never the values. */
export function forecastMeasures(draft: ForecastDraft): string {
  const fields = forecastFields(draft);
  return MEASURES.filter((m) => fields[m === "revenue" ? "forecastRevenue" : "forecastUnits"]).join(
    "+",
  );
}

const hintValue = (measure: ForecastMeasure, hint: Hint) =>
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
        {MEASURES.map((measure) => {
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
          maxLength={NOTE_MAX}
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
