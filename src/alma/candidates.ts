// The server's three candidates for a quarter (endless.md sections 2 and 9). Each is a type with its params and
// a stretch, all within the limits and the choosing rules, drawn from the save's seed and the quarter, so a
// retry draws the same three. Alma only picks one and writes its flavor: it can't set a param, a measure or a
// size, so it can't aim the quarter at a player.

import {
  EVENT_TYPES,
  MEASURE_IDS,
  STRETCH_PERCENT,
  type EventType,
  type MeasureId,
} from "./events";
import type { QuarterId } from "~/simulation/quarters";
import type { AlmaRecord } from "./record";

/**
 * The stretch beside the event: none while two strikes count. A recovery goal names the fallen measure, at the
 * largest stretch, its cap (section 2); the record keeps the fall as `drop`.
 */
export type Stretch = { measure: MeasureId; percent: number } | null;

export interface Candidate {
  type: string;
  params: Record<string, string | number>;
  stretch: Stretch;
}

export interface QuarterContext {
  /** The quarter being prepared, "2194-Q3". */
  quarter: QuarterId;
  /** The records of earlier quarters, oldest first. */
  previous: readonly AlmaRecord[];
  /** How many strikes count against the player now (section 7). */
  strikes: number;
  /** A measure that fell by more than 10% against the same quarter a year earlier, and by how much (whole %). */
  recovery?: { measure: MeasureId; drop: number };
}

/** From this many strikes counting, the quarter is drawn gently: "no piling on" (section 2). */
export const PILING_ON_STRIKES = 2;
/** With two strikes counting, author fares are at most the usual $200. */
const GENTLE_FARES = 200;
/** Types used in this many recent quarters are drawn less often. */
const RECENT = 4;

export const pilingOn = (context: QuarterContext) => context.strikes >= PILING_ON_STRIKES;
/** A recovery goal applies unless two strikes count. */
export const recoveryOf = (context: QuarterContext) =>
  pilingOn(context) ? undefined : context.recovery;

/** A deterministic stream of numbers in [0, 1) from the seed, the quarter and a purpose (FNV-1a, then mulberry32). */
export function random(...parts: (string | number)[]): () => number {
  let h = 0x811c9dc5;
  for (const ch of parts.join(":")) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193);
  }
  let state = h >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(list: readonly T[], next: () => number): T =>
  list[Math.floor(next() * list.length)];

/** The measures a type's stretch may name in this quarter, or [] if it may have none. */
function stretchMeasures(type: EventType, context: QuarterContext): MeasureId[] {
  const recovery = recoveryOf(context);
  const last = context.previous.at(-1)?.stretch?.measure;
  const measures = recovery ? [recovery.measure] : MEASURE_IDS.filter((m) => m !== last);
  return measures.filter((m) => !type.against.includes(m));
}

/** Why a candidate breaks the limits or the choosing rules in this quarter, or null if it's allowed. */
export function candidateProblem(
  candidate: Candidate,
  context: QuarterContext,
  { repeats = true } = {},
): string | null {
  const type = EVENT_TYPES.find((t) => t.id === candidate.type);
  if (!type) return "type";
  const names = Object.keys(type.params);
  if (Object.keys(candidate.params).length !== names.length) return "params";
  for (const name of names) {
    const spec = type.params[name],
      v = candidate.params[name];
    if (
      spec.kind === "enum"
        ? typeof v !== "string" || !spec.values.includes(v)
        : !Number.isInteger(v) || (v as number) < spec.min || (v as number) > spec.max
    )
      return "params";
  }
  const gentle = pilingOn(context);
  if (gentle && !type.mild) return "piling_on";
  if (gentle && type.id === "author_fares" && (candidate.params.cost as number) > GENTLE_FARES)
    return "piling_on";
  if (gentle !== (candidate.stretch === null)) return "stretch";
  if (candidate.stretch) {
    const { measure, percent } = candidate.stretch;
    if (
      !Number.isInteger(percent) ||
      percent < STRETCH_PERCENT.min ||
      percent > STRETCH_PERCENT.max
    )
      return "stretch";
    if (!stretchMeasures(type, repeats ? context : { ...context, previous: [] }).includes(measure))
      return "stretch";
  }
  if (repeats && context.previous.at(-1)?.type === type.id) return "repeat";
  if (type.oncePer && context.previous.slice(-(type.oncePer - 1)).some((r) => r.type === type.id))
    return "too_often";
  return null;
}

/** Whether a type may be drawn this quarter at all: its params can always be drawn within limits. */
function typeAllowed(type: EventType, context: QuarterContext, repeats: boolean): boolean {
  if (pilingOn(context) && !type.mild) return false;
  if (repeats && context.previous.at(-1)?.type === type.id) return false;
  if (type.oncePer && context.previous.slice(-(type.oncePer - 1)).some((r) => r.type === type.id))
    return false;
  return (
    pilingOn(context) ||
    stretchMeasures(type, repeats ? context : { ...context, previous: [] }).length > 0
  );
}

/** Fares this far apart, or more, are different offers. */
const FARES_APART = 50;

/**
 * Whether two candidates are really different offers (Plot, on the live check's $150 and $149 fares): another
 * type, or the same type with another genre, weekday or format, or fares at least $50 apart.
 */
export function apart(a: Candidate, b: Candidate): boolean {
  if (a.type !== b.type) return true;
  for (const key of ["genre", "weekday", "format"])
    if (key in a.params && a.params[key] !== b.params[key]) return true;
  if (a.type === "author_fares")
    return Math.abs((a.params.cost as number) - (b.params.cost as number)) >= FARES_APART;
  return false;
}

function draw(
  type: EventType,
  context: QuarterContext,
  next: () => number,
  repeats: boolean,
  siblings: readonly Candidate[] = [],
): Candidate | null {
  const params: Record<string, string | number> = {};
  for (const [name, spec] of Object.entries(type.params)) {
    // Values the same type's other candidates don't have, where there are any.
    const taken = siblings.map((c) => c.params[name]);
    if (spec.kind === "enum") {
      const free = spec.values.filter((v) => !taken.includes(v));
      params[name] = pick(free.length ? free : spec.values, next);
    } else {
      const max =
        pilingOn(context) && type.id === "author_fares"
          ? Math.min(spec.max, GENTLE_FARES)
          : spec.max;
      const all = Array.from({ length: max - spec.min + 1 }, (_, i) => spec.min + i);
      const free =
        type.id === "author_fares"
          ? all.filter((v) => taken.every((t) => Math.abs(v - (t as number)) >= FARES_APART))
          : all;
      params[name] = pick(free.length ? free : all, next);
    }
  }
  let stretch: Stretch = null;
  if (!pilingOn(context)) {
    const measures = stretchMeasures(type, repeats ? context : { ...context, previous: [] });
    if (!measures.length) return null;
    // A recovery goal's size is set by scoring.md's rule, capped at the largest stretch, which is what it records.
    const percent = recoveryOf(context)
      ? STRETCH_PERCENT.max
      : STRETCH_PERCENT.min + Math.floor(next() * (STRETCH_PERCENT.max - STRETCH_PERCENT.min + 1));
    stretch = { measure: pick(measures, next), percent };
  }
  const candidate = { type: type.id, params, stretch };
  return candidateProblem(candidate, context, { repeats }) ? null : candidate;
}

/**
 * Three candidates for the quarter, distinct types where the rules allow it, weighted away from the types of
 * the last four quarters. If the rules leave no type at all (a recovery goal on a measure every allowed type
 * works against, after a surge), only the rules about repeating last quarter give way, never the limits,
 * "no piling on" or the recovery goal.
 */
export function drawCandidates(
  seed: number,
  context: QuarterContext,
  accept: (candidate: Candidate) => boolean = () => true,
): [Candidate, Candidate, Candidate] {
  const recent = context.previous.slice(-RECENT).map((r) => r.type);
  // `accept` is a check the server makes that needs the data (Sim's eventProblem, the 10% bound): drawn
  // candidates must pass it. Only if no three can is it set aside, so a quarter always has its event.
  for (const [repeats, checked] of [
    [true, true],
    [false, true],
    [true, false],
    [false, false],
  ] as const) {
    const next = random(seed, context.quarter, "candidates");
    const allowed = EVENT_TYPES.filter((t) => typeAllowed(t, context, repeats));
    if (!allowed.length) continue;
    const weight = (t: EventType) => 1 / (1 + recent.filter((id) => id === t.id).length);
    const chosen: Candidate[] = [];
    const pool = [...allowed];
    for (let tries = 0; chosen.length < 3 && tries < 200; tries++) {
      // A type not drawn yet first, by weight; once every allowed type is in, more of the same, with other params.
      const fresh = pool.filter((t) => !chosen.some((c) => c.type === t.id));
      const from = fresh.length ? fresh : pool;
      const total = from.reduce((s, t) => s + weight(t), 0);
      let r = next() * total;
      const type = from.find((t) => (r -= weight(t)) < 0) ?? from.at(-1)!;
      const candidate = draw(
        type,
        context,
        next,
        repeats,
        chosen.filter((c) => c.type === type.id),
      );
      // Really different offers while the tries last; at the end, any distinct one (two strikes can leave only
      // fares, and three fares can't all be $50 apart between $100 and $200 unless they're exactly that).
      // The server's check last: it can cost an anchor computation, so a duplicate never pays for one (Audit).
      if (
        candidate &&
        chosen.every((c) =>
          tries < 150 ? apart(c, candidate) : JSON.stringify(c) !== JSON.stringify(candidate),
        ) &&
        (!checked || accept(candidate))
      )
        chosen.push(candidate);
    }
    if (chosen.length === 3) return chosen as [Candidate, Candidate, Candidate];
  }
  throw new Error(`No three candidates fit ${context.quarter}.`);
}
