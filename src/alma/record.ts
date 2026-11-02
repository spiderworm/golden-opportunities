// The record the save keeps of a quarter's event (endless.md section 9): the chosen candidate's type, params and
// stretch, copied in, and Alma's flavor. The save is the source of truth once a record is written: the
// simulation reads its type, params and stretch, and never asks Alma again, so a reload or a replay gives the
// same quarter.

import { MEASURE_IDS, type MeasureId } from "./events";
import { TEXT_LIMITS, TEXT_PROBLEMS } from "./text";

export interface AlmaRecord {
  /** The quarter it's for, "2194-Q3". */
  quarter: string;
  source: "alma" | "scripted";
  type: string;
  params: Record<string, string | number>;
  /** None while two strikes count. */
  stretch: { measure: MeasureId; percent: number } | null;
  /** For a recovery goal, the measure's fall in whole percent: the server writes its reason from it. */
  drop?: number;
  story: string;
  /** The stretch's reason, for an extra stretch only: a recovery goal's is the server's, and two strikes have none. */
  reason?: string;
  bossLine: string;
  /** The model that wrote it; absent for a scripted record. */
  model?: string;
  promptVersion: number;
  /** Model calls made: 0 when the model wasn't asked. */
  attempts: number;
  /** Why the model's answer wasn't used, when it wasn't: one of FAILURES. */
  failure?: string;
}

/**
 * Every failure code there is, so a model's own text can never become one. Append only: a saved record keeps
 * its code, and isAlmaRecord refuses one that isn't here (Frank's review of #178).
 */
export const FAILURES: readonly string[] = [
  "not_json",
  "shape",
  "candidate",
  "reason",
  "timeout",
  ...["missing", "broken", "timeout", "signed_out", "other"].map((k) => `unavailable:${k}`),
  ...(["story", "reason", "bossLine"] as const).flatMap((field) => TEXT_PROBLEMS.map((p) => `text:${field}:${p}`)),
];

export const QUARTER = /^\d{4}-Q[1-4]$/;

const isPlain = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const shortText = (v: unknown, limit: number) => typeof v === "string" && v.length <= limit;
const keysAre = (v: Record<string, unknown>, required: string[], optional: string[] = []) =>
  required.every((k) => k in v) && Object.keys(v).every((k) => required.includes(k) || optional.includes(k));
const smallInt = (v: unknown, max: number) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max;

/**
 * The save's check on one stored record (Frank calls it from store.server.ts). Bounded, because the save is
 * capped and the text is model-written: short texts, a small flat params object, a small attempt count, and a
 * failure from the fixed list. It checks shape, not the event's limits, so a record written under one set of
 * limits stays readable if they're tuned later.
 */
export function isAlmaRecord(value: unknown): value is AlmaRecord {
  if (!isPlain(value)) return false;
  if (!keysAre(value, ["quarter", "source", "type", "params", "stretch", "story", "bossLine", "promptVersion", "attempts"], ["drop", "reason", "model", "failure"])) return false;
  const { quarter, source, type, params, stretch, drop, story, reason, bossLine, model, promptVersion, attempts, failure } = value;
  if (typeof quarter !== "string" || !QUARTER.test(quarter)) return false;
  if (source !== "alma" && source !== "scripted") return false;
  if (!shortText(type, 40) || !/^[a-z_]+$/.test(type as string)) return false;
  if (!isPlain(params) || Object.keys(params).length > 8) return false;
  for (const [k, v] of Object.entries(params)) {
    if (!/^[a-z_]{1,20}$/.test(k)) return false;
    if (!(typeof v === "number" ? Number.isInteger(v) && Math.abs(v) <= 1_000_000 : shortText(v, 40))) return false;
  }
  if (stretch !== null && !(isPlain(stretch) && keysAre(stretch, ["measure", "percent"]) && (MEASURE_IDS as readonly unknown[]).includes(stretch.measure) && smallInt(stretch.percent, 100))) return false;
  if (drop !== undefined && (!smallInt(drop, 100) || stretch === null || reason !== undefined)) return false;
  if (!shortText(story, TEXT_LIMITS.story) || !shortText(bossLine, TEXT_LIMITS.bossLine)) return false;
  if (reason !== undefined && !shortText(reason, TEXT_LIMITS.reason)) return false;
  if (model !== undefined && !shortText(model, 60)) return false;
  if (!smallInt(promptVersion, 1000) || !smallInt(attempts, 5)) return false;
  if (failure !== undefined && !(typeof failure === "string" && FAILURES.includes(failure))) return false;
  return true;
}

export const quarterIndex = (q: string) => Number(q.slice(0, 4)) * 4 + Number(q.slice(-1));

/**
 * The save's check on the whole log: every record valid, at most one per quarter, in quarter order, and none
 * past `latest`, the furthest quarter that may have one (the next, unplayed quarter Alma is preparing).
 */
export function isAlmaLog(value: unknown, latest: string): value is AlmaRecord[] {
  if (!Array.isArray(value) || value.length > 400 || !QUARTER.test(latest)) return false;
  let last = -Infinity;
  for (const record of value) {
    if (!isAlmaRecord(record)) return false;
    const at = quarterIndex(record.quarter);
    if (at <= last || at > quarterIndex(latest)) return false;
    last = at;
  }
  return true;
}
