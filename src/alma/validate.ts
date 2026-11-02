// Checks Alma's answer (endless.md section 9): exactly one JSON object of a fixed shape, every param within its
// type's limits (no free numbers, no clamping), the choosing rules of section 2, and the text checks. The
// scripted fallback goes through the same checks, so nothing reaches a save unchecked.

import { EVENT_TYPES, eventType, MEASURE_IDS, STRETCH_PERCENT, type MeasureId, type ParamSpec } from "./events";
import { type AlmaChoice, type AlmaRecord } from "./record";
import { renderText, textProblem } from "./text";

export interface ChoiceContext {
  /** The quarter being prepared, "2194-Q3". */
  quarter: string;
  /** The records of earlier quarters, oldest first. */
  previous: readonly AlmaRecord[];
  /** How many strikes count against the player now. From two, only a mild event may be chosen ("no piling on"). */
  strikes: number;
  /** A measure that fell by more than 10% against the same quarter a year earlier: the stretch must name it. */
  recovery?: { measure: MeasureId; drop: number };
}

/** From this many strikes counting, Alma may choose only a mild event (endless.md section 2). */
export const PILING_ON_STRIKES = 2;

export type Checked = { ok: true; choice: AlmaChoice } | { ok: false; failure: string };

const isPlain = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const exactKeys = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && keys.every((k) => k in v);

/** The model's text as one JSON object of the right shape, or why not. A single ```json fence is tolerated. */
export function parseChoice(raw: string): Checked {
  const body = raw.trim().replace(/^```(?:json)?\s*\n([\s\S]*)\n```$/, "$1");
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return { ok: false, failure: "not_json" };
  }
  if (!isPlain(value) || !exactKeys(value, ["type", "params", "stretch", "story", "bossLine"])) return { ok: false, failure: "shape" };
  if (!isPlain(value.params) || !isPlain(value.stretch) || !exactKeys(value.stretch, ["measure", "percent", "reason"])) return { ok: false, failure: "shape" };
  // Folded once here, so the text that's checked is the text that's stored (Frank's review: a decomposed "café"
  // is longer raw than folded, and the save measures what's stored).
  const fold = (v: unknown) => (typeof v === "string" ? v.normalize("NFKC") : v);
  const choice = {
    type: value.type,
    params: Object.fromEntries(Object.entries(value.params).map(([k, v]) => [k, fold(v)])),
    stretch: { measure: value.stretch.measure, percent: value.stretch.percent, reason: fold(value.stretch.reason) },
    story: fold(value.story),
    bossLine: fold(value.bossLine),
  };
  return { ok: true, choice: choice as unknown as AlmaChoice };
}

const paramFits = (spec: ParamSpec, value: unknown) =>
  spec.kind === "enum" ? typeof value === "string" && spec.values.includes(value) : Number.isInteger(value) && (value as number) >= spec.min && (value as number) <= spec.max;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** The text each slot renders to: the params in their units, the stretch, the quarter and any recovery drop. */
export function slotValues(choice: AlmaChoice, context: Pick<ChoiceContext, "quarter" | "recovery">): Record<string, string> {
  const type = eventType(choice.type);
  const q = Number(context.quarter.slice(-1));
  const values: Record<string, string> = { quarter: `Q${q} ${context.quarter.slice(0, 4)}`, stretch: `${choice.stretch.percent}%` };
  if (context.recovery) values.drop = `${context.recovery.drop}%`;
  for (const [name, spec] of Object.entries(type?.params ?? {})) {
    const v = choice.params[name];
    values[name] = spec.kind === "enum" ? String(v) : spec.unit === "percent" ? `${v}%` : spec.unit === "dollars" ? `$${v}` : MONTHS[(q - 1) * 3 + Number(v) - 1];
  }
  return values;
}

/** Why a well-formed choice breaks a limit or a rule, or null if it's allowed. */
export function choiceProblem(choice: AlmaChoice, context: ChoiceContext): string | null {
  const type = eventType(choice.type);
  if (!type) return "type";
  const names = Object.keys(type.params);
  if (!exactKeys(choice.params, names) || !names.every((n) => paramFits(type.params[n], choice.params[n]))) return "params";
  const { measure, percent } = choice.stretch;
  if (!(MEASURE_IDS as readonly unknown[]).includes(measure)) return "stretch_measure";
  if (!Number.isInteger(percent) || percent < STRETCH_PERCENT.min || percent > STRETCH_PERCENT.max) return "stretch_percent";

  const last = context.previous.at(-1);
  if (last?.type === type.id) return "rule:repeat_type";
  if (context.recovery) {
    if (measure !== context.recovery.measure) return "rule:recovery";
  } else if (last?.stretch.measure === measure) return "rule:repeat_stretch";
  if (type.against.includes(measure)) return "rule:against_stretch";
  if (context.strikes >= PILING_ON_STRIKES && !type.mild) return "rule:piling_on";
  if (type.oncePer && context.previous.slice(-(type.oncePer - 1)).some((r) => r.type === type.id)) return "rule:too_often";

  const slots = new Set(Object.keys(slotValues(choice, context)));
  for (const [field, text] of [["story", choice.story], ["reason", choice.stretch.reason], ["bossLine", choice.bossLine]] as const) {
    const problem = textProblem(field, text, slots);
    if (problem) return `text:${field}:${problem}`;
  }
  return null;
}

/** Parses and checks the model's answer in one go. */
export function checkAnswer(raw: string, context: ChoiceContext): Checked {
  const parsed = parseChoice(raw);
  if (!parsed.ok) return parsed;
  const problem = choiceProblem(parsed.choice, context);
  return problem ? { ok: false, failure: problem } : parsed;
}

/** A record's three texts, rendered for the player. */
export function renderRecord(record: AlmaRecord) {
  const recovery = record.drop === undefined ? undefined : { measure: record.stretch.measure, drop: record.drop };
  const values = slotValues(record, { quarter: record.quarter, recovery });
  return { story: renderText(record.story, values), reason: renderText(record.stretch.reason, values), bossLine: renderText(record.bossLine, values) };
}

export { EVENT_TYPES };
