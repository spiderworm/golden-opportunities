// Checks a stored Q2 outcome before the game trusts it: a corrupt save must fail
// closed, not become UI data. Imports nothing but types and the plan check.
import { isQ2Plan } from "./plan.ts";
import { MEASURE_IDS, type Q2Outcome } from "./types.ts";

const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const text = (v: unknown, max = 4096): v is string => typeof v === "string" && v.length <= max;
const GRADES = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D", "F"];
const CERTIFICATES = ["exceeds", "comeback", "weathered", "wellRounded"];
const isMeasure = (v: unknown) => (MEASURE_IDS as readonly unknown[]).includes(v);
const score = (v: unknown) => finite(v) && v >= 0 && v <= 100;
const measureList = (v: unknown) =>
  Array.isArray(v) && v.length <= 4 && v.every(isMeasure) && new Set(v).size === v.length;
const QUARTER = /^\d{4}-Q[1-4]$/;
/** An event as a certificate names it: a short type and a few short params. */
const certificateEvent = (v: unknown) =>
  record(v) &&
  text(v.type, 40) &&
  Object.keys(v).length === 2 &&
  record(v.params) &&
  Object.keys(v.params).length <= 4 &&
  Object.values(v.params).every((p) => finite(p) || text(p, 40));
/** A certificate and the fields it may carry (Comeback's quarter, Weathered the Storm's measures and event). */
const certificate = (c: unknown) =>
  record(c) &&
  CERTIFICATES.includes(String(c.id)) &&
  Object.keys(c).every((k) => ["id", "measure", "previous", "measures", "event"].includes(k)) &&
  (c.measure === undefined || isMeasure(c.measure)) &&
  (c.previous === undefined || (typeof c.previous === "string" && QUARTER.test(c.previous))) &&
  (c.measures === undefined || measureList(c.measures)) &&
  (c.event === undefined || certificateEvent(c.event));

function metrics(v: unknown): boolean {
  return (
    record(v) &&
    ["revenue", "units", "grossProfit"].every((k) => finite(v[k])) &&
    ["orders", "costOfGoods", "eventCosts"].every((k) => v[k] === undefined || finite(v[k]))
  );
}

function reportCard(v: unknown): boolean {
  if (!record(v) || !Array.isArray(v.measures) || v.measures.length !== 4) return false;
  const measuresOk = v.measures.every(
    (m, i) =>
      record(m) &&
      m.id === MEASURE_IDS[i] &&
      ["result", "lastYear", "goal"].every((k) => finite(m[k])) &&
      score(m.score) &&
      GRADES.includes(String(m.grade)) &&
      typeof m.met === "boolean" &&
      typeof m.exceeds === "boolean",
  );
  const o = v.overall;
  return (
    measuresOk &&
    record(o) &&
    score(o.score) &&
    GRADES.includes(String(o.grade)) &&
    measureList(o.binding) &&
    measureList(o.closeBehind) &&
    finite(o.closeMargin) &&
    typeof o.allMet === "boolean" &&
    typeof o.sacrifice === "boolean" &&
    Array.isArray(v.certificates) &&
    v.certificates.length <= 10 &&
    v.certificates.every(certificate)
  );
}

const numbers = (v: unknown, keys: readonly string[]) =>
  record(v) && Object.keys(v).length === keys.length && keys.every((k) => finite(v[k]));

function pick(v: unknown, isbn: string | null): boolean {
  if (v === null) return isbn === null;
  return (
    record(v) &&
    v.isbn === isbn &&
    text(v.title, 200) &&
    text(v.format, 100) &&
    ["extra", "baseCopies", "discountCost"].every((k) => finite(v[k]))
  );
}

/**
 * A Q2 outcome as simulateQ2 makes it: quarter 2194-Q2, months April to June,
 * one pick fact per month matching the plan. The game's own `discoveries` key
 * is left for the game to check; the store also checks totals.plan.units
 * against the quarter's saved lines, which an outcome alone can't see.
 */
export function isQ2Outcome(v: unknown, quarter = "2194-Q2"): v is Q2Outcome {
  // Every quarter after Q1 has Q2's shape (simulateTurn); its months are the quarter's own.
  if (!record(v) || !isQ2Plan(v.plan) || v.quarter !== quarter || !/^\d{4}-Q[1-4]$/.test(quarter))
    return false;
  const plan = v.plan;
  if (!record(v.totals) || !metrics(v.totals.plan) || !metrics(v.totals.holdCourse)) return false;
  if (
    !record(v.reportCard) ||
    !reportCard(v.reportCard.plan) ||
    !reportCard(v.reportCard.holdCourse)
  )
    return false;
  const [year, q] = quarter.split("-Q");
  const months = [0, 1, 2].map((i) => `${year}-${String(3 * Number(q) - 2 + i).padStart(2, "0")}`);
  if (
    !Array.isArray(v.monthly) ||
    v.monthly.length !== 3 ||
    !v.monthly.every(
      (m, i) =>
        record(m) &&
        m.month === months[i] &&
        record(m.plan) &&
        record(m.holdCourse) &&
        [m.plan.revenue, m.plan.units, m.holdCourse.revenue, m.holdCourse.units].every(finite),
    )
  )
    return false;
  if (
    !Array.isArray(v.assumptions) ||
    v.assumptions.length > 100 ||
    !v.assumptions.every(
      (a) =>
        record(a) &&
        text(a.id) &&
        text(a.text) &&
        ["data", "assumed", "setup"].includes(String(a.source)) &&
        typeof a.usedByPlan === "boolean",
    )
  )
    return false;
  if (!Array.isArray(v.happened) || v.happened.length > 32 || !v.happened.every((s) => text(s)))
    return false;
  const f = v.facts;
  if (
    !record(f) ||
    !finite(f.amount) ||
    !Array.isArray(f.picks) ||
    f.picks.length !== 3 ||
    !f.picks.every((p, m) => pick(p, plan.picks[m]))
  )
    return false;
  if (Object.keys(f).some((k) => !["picks", "amount", "events", "sale"].includes(k))) return false;
  if (
    (f.events !== undefined) !== plan.levers.includes("events") ||
    (f.sale !== undefined) !== plan.levers.includes("sale")
  )
    return false;
  return (
    (f.events === undefined ||
      numbers(f.events, ["nights", "orders", "perNight", "gross", "eventCosts"])) &&
    (f.sale === undefined || numbers(f.sale, ["unitsPct", "perBook", "revPct", "profitPct"]))
  );
}
