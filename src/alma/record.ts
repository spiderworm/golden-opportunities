// What Alma decides for a quarter, and the record the save keeps of it (endless.md section 9). The save is the
// source of truth once a record is written: the simulation reads its type, params and stretch, and never asks
// Alma again, so a reload or a replay gives the same quarter. The story is kept with its slots, not rendered, so
// its figures always come from the params beside it.

import { MEASURE_IDS, type MeasureId } from "./events";
import { TEXT_LIMITS } from "./text";

export interface AlmaChoice {
  type: string;
  params: Record<string, string | number>;
  stretch: { measure: MeasureId; percent: number; reason: string };
  story: string;
  bossLine: string;
}

export interface AlmaRecord extends AlmaChoice {
  /** The quarter it's for, "2194-Q3". */
  quarter: string;
  source: "alma" | "scripted";
  /** The model that wrote it; absent for a scripted record. */
  model?: string;
  promptVersion: number;
  /** Model calls made: 0 when the model wasn't asked. */
  attempts: number;
  /** Why the model's answer wasn't used, when it wasn't: a short code. */
  failure?: string;
  /** For a recovery stretch, the measure's fall in percent, which its `{{drop}}` slot renders. */
  drop?: number;
}

export const QUARTER = /^\d{4}-Q[1-4]$/;
const FAILURE_LIMIT = 80;
const PARAMS_LIMIT = 8;

const isPlain = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const shortText = (v: unknown, limit: number) => typeof v === "string" && v.length <= limit;
const keysAre = (v: Record<string, unknown>, required: string[], optional: string[] = []) =>
  required.every((k) => k in v) && Object.keys(v).every((k) => required.includes(k) || optional.includes(k));

/**
 * The save's check on one stored record (Frank calls it from store.server.ts). Bounded, because the save is
 * capped and the text is model-written: short texts, a small flat params object, a small attempt count. It
 * checks shape, not the event's limits: a record that was valid when written stays readable if the limits are
 * tuned later.
 */
export function isAlmaRecord(value: unknown): value is AlmaRecord {
  if (!isPlain(value)) return false;
  if (!keysAre(value, ["quarter", "source", "type", "params", "stretch", "story", "bossLine", "promptVersion", "attempts"], ["model", "failure", "drop"])) return false;
  const { quarter, source, type, params, stretch, story, bossLine, model, promptVersion, attempts, failure, drop } = value;
  if (typeof quarter !== "string" || !QUARTER.test(quarter)) return false;
  if (source !== "alma" && source !== "scripted") return false;
  if (!shortText(type, 40) || !/^[a-z_]+$/.test(type as string)) return false;
  if (!isPlain(params) || Object.keys(params).length > PARAMS_LIMIT) return false;
  for (const [k, v] of Object.entries(params)) {
    if (!/^[a-z_]{1,20}$/.test(k)) return false;
    if (!(typeof v === "number" ? Number.isInteger(v) && Math.abs(v) <= 1_000_000 : shortText(v, 40))) return false;
  }
  if (!isPlain(stretch) || !keysAre(stretch, ["measure", "percent", "reason"])) return false;
  if (!(MEASURE_IDS as readonly unknown[]).includes(stretch.measure) || !Number.isInteger(stretch.percent) || (stretch.percent as number) < 0 || (stretch.percent as number) > 100) return false;
  if (!shortText(stretch.reason, TEXT_LIMITS.reason) || !shortText(story, TEXT_LIMITS.story) || !shortText(bossLine, TEXT_LIMITS.bossLine)) return false;
  if (model !== undefined && !shortText(model, 60)) return false;
  if (!Number.isInteger(promptVersion) || (promptVersion as number) < 0 || (promptVersion as number) > 1000) return false;
  if (!Number.isInteger(attempts) || (attempts as number) < 0 || (attempts as number) > 5) return false;
  if (failure !== undefined && !shortText(failure, FAILURE_LIMIT)) return false;
  if (drop !== undefined && (!Number.isInteger(drop) || (drop as number) < 0 || (drop as number) > 100)) return false;
  return true;
}

const quarterIndex = (q: string) => Number(q.slice(0, 4)) * 4 + Number(q.slice(-1));

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

export { quarterIndex };
