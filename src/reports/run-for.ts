// "Run for…" on a report (David, req_a59d77f07115: "Agreed on all points"): the report shown for another quarter, a
// view only. Every chart with quarters of its own moves by the same number of quarters, counted from the report's
// newest, so a comparison of Q3 against Q4 becomes Q4 against Q1 and each chart keeps its span (Goldy's call). A chart
// over every quarter stays as saved, and one that can't move says why (Plot, section 9). Client-safe.
import { parsePinSpec, type PinSpec } from "../investigate/pins/spec.ts";
import {
  isAvailable,
  isRelativeQuarter,
  resolveQuarter,
  shiftQuarter,
  type RelativeQuarter,
} from "../query/relative.ts";
import { MEASURE_DIMENSIONS, type Dimension, type Measure } from "../query/types.ts";

/** What the report runs for: as saved, a relative quarter, or a played quarter ("2194-Q1"). */
export type RunChoice = "saved" | RelativeQuarter | string;

/** Why a chart shows as saved when the report runs for another quarter. */
export type StaysWhy = "every" | "past" | "cant" | "ratings" | "checkouts";

export type Moved = { spec: PinSpec; stays: null } | { spec: PinSpec; stays: StaysWhy };

type Filter = Partial<Record<Dimension, readonly string[]>>;

const QUARTER = /^\d{4}-Q[1-4]$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const index = (quarter: string) => Number(quarter.slice(0, 4)) * 4 + Number(quarter.slice(-1)) - 1;
const monthQuarter = (month: string) =>
  `${month.slice(0, 4)}-Q${Math.floor((Number(month.slice(5)) - 1) / 3) + 1}`;
function shiftMonth(month: string, by: number): string {
  const at = Number(month.slice(0, 4)) * 12 + Number(month.slice(5)) - 1 + by * 3;
  return `${Math.floor(at / 12)}-${String((at % 12) + 1).padStart(2, "0")}`;
}

/** The quarter a choice runs for, as dated; null for As saved, or a relative quarter that's none the player can see. */
export function runQuarter(choice: RunChoice, quarters: readonly string[]): string | null {
  if (choice === "saved") return null;
  const quarter = isRelativeQuarter(choice) ? resolveQuarter(choice, quarters) : choice;
  return isAvailable(quarter, quarters) ? quarter : null;
}

/** A dated quarter a value stands for: a quarter, a relative quarter as it is now, or a month's quarter. */
function quarterOf(
  dimension: Dimension,
  value: string,
  quarters: readonly string[],
): string | null {
  if (dimension === "quarter")
    return isRelativeQuarter(value)
      ? resolveQuarter(value, quarters)
      : QUARTER.test(value)
        ? value
        : null;
  if (dimension === "month" && MONTH.test(value)) return monthQuarter(value);
  return null;
}

/** A value moved by `by` quarters; a relative quarter becomes the dated one it is now, moved. */
function moved(dimension: Dimension, value: string, by: number, quarters: readonly string[]) {
  if (dimension === "month") return shiftMonth(value, by);
  const quarter = isRelativeQuarter(value) ? resolveQuarter(value, quarters) : value;
  return quarter === null ? null : shiftQuarter(quarter, by);
}

const DATED: readonly Dimension[] = ["quarter", "month"];

/** Every quarter a chart names: its quarter and month filters, a comparison's sides, a waterfall's then and now. */
function namedQuarters(spec: PinSpec, quarters: readonly string[]): (string | null)[] {
  const out: (string | null)[] = [];
  const filter = (f: Filter | undefined) => {
    for (const d of DATED) for (const v of f?.[d] ?? []) out.push(quarterOf(d, v, quarters));
  };
  if (spec.kind === "waterfall") {
    out.push(quarterOf("quarter", spec.waterfall.then, quarters));
    out.push(quarterOf("quarter", spec.waterfall.now, quarters));
    filter(spec.waterfall.filter);
  } else if (spec.kind === "comparison") {
    const c = spec.comparison;
    if (DATED.includes(c.across))
      out.push(quarterOf(c.across, c.from, quarters), quarterOf(c.across, c.to, quarters));
    filter(c.filter);
  } else filter(spec.query.filter);
  return out;
}

/** The report's newest quarter: the latest any of its charts names, as they'd run now. Null if none names one. */
export function newestQuarter(
  specs: readonly PinSpec[],
  quarters: readonly string[],
): string | null {
  const named = specs
    .flatMap((s) => namedQuarters(s, quarters))
    .filter((q): q is string => q !== null);
  return named.length ? named.reduce((a, b) => (index(a) >= index(b) ? a : b)) : null;
}

/** How many quarters from the report's newest to the one it runs for. */
export const runOffset = (newest: string, quarter: string) => index(quarter) - index(newest);

function measuresOf(spec: PinSpec): Measure[] {
  if (spec.kind === "waterfall") return ["revenue"];
  if (spec.kind === "comparison") return [spec.comparison.measure];
  return [spec.query.measure, ...(spec.also ?? [])];
}

function shiftFilter(filter: Filter | undefined, by: number, quarters: readonly string[]) {
  if (!filter) return { filter, ok: true };
  const out: Filter = { ...filter };
  let ok = true;
  for (const d of DATED) {
    const values = filter[d];
    if (!values) continue;
    const next = values.map((v) => moved(d, v, by, quarters));
    if (next.some((v) => v === null)) ok = false;
    out[d] = [...new Set(next.filter((v): v is string => v !== null))];
  }
  return { filter: out, ok };
}

/**
 * A chart moved by `by` quarters, or as saved with why: an undated measure; nothing of its own to move (over every
 * quarter); a quarter past the ledgers (`quarters`, the visible ones); or a shape the move would break.
 */
export function moveChart(spec: PinSpec, by: number, quarters: readonly string[]): Moved {
  const undated = measuresOf(spec).find((m) => !MEASURE_DIMENSIONS[m].includes("quarter"));
  if (undated) return { spec, stays: undated === "checkouts" ? "checkouts" : "ratings" };
  if (!namedQuarters(spec, quarters).length) return { spec, stays: "every" };
  if (by === 0) return { spec, stays: null };
  let next: PinSpec;
  let ok = true;
  if (spec.kind === "waterfall") {
    const w = spec.waterfall;
    const then = moved("quarter", w.then, by, quarters);
    const now = moved("quarter", w.now, by, quarters);
    const f = shiftFilter(w.filter, by, quarters);
    ok = then !== null && now !== null && f.ok;
    next = {
      ...spec,
      waterfall: {
        ...w,
        then: then ?? w.then,
        now: now ?? w.now,
        ...(f.filter ? { filter: f.filter } : {}),
      },
    };
  } else if (spec.kind === "comparison") {
    const c = spec.comparison;
    const sides = DATED.includes(c.across);
    const from = sides ? moved(c.across, c.from, by, quarters) : c.from;
    const to = sides ? moved(c.across, c.to, by, quarters) : c.to;
    const f = shiftFilter(c.filter, by, quarters);
    ok = from !== null && to !== null && f.ok;
    next = {
      ...spec,
      comparison: {
        ...c,
        from: from ?? c.from,
        to: to ?? c.to,
        ...(f.filter ? { filter: f.filter } : {}),
      },
    };
  } else {
    const f = shiftFilter(spec.query.filter, by, quarters);
    ok = f.ok;
    next = { ...spec, query: { ...spec.query, ...(f.filter ? { filter: f.filter } : {}) } };
  }
  if (!ok) return { spec, stays: "cant" };
  if (namedQuarters(next, quarters).some((q) => q === null || !quarters.includes(q)))
    return { spec, stays: "past" };
  // Checked as a pin is: a move that breaks its shape shows it as saved.
  const checked = parsePinSpec(next);
  return checked ? { spec: checked, stays: null } : { spec, stays: "cant" };
}
