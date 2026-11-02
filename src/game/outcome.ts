import { isPlan } from '../simulation/plan.ts';
import type { Outcome } from '../simulation/types';
import { isQ2Outcome } from '../simulation/outcome-check.ts';
import type { PlayedQuarter } from './types';

const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.length <= 4096;
const ids = ['profit', 'readers', 'happiness', 'culture'];
const grades = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D', 'F'];
const score = (v: unknown) => finite(v) && v >= 0 && v <= 100;
const measures = (v: unknown) => Array.isArray(v) && v.length <= 4 && v.every(id => ids.includes(id)) && new Set(v).size === v.length;
function metrics(v: unknown): boolean {
  return record(v) && ['revenue', 'units', 'grossProfit'].every(k => finite(v[k]))
    && ['orders', 'costOfGoods', 'eventCosts'].every(k => v[k] === undefined || finite(v[k]));
}
function report(v: unknown): boolean {
  if (!record(v) || !Array.isArray(v.measures) || v.measures.length !== 4 || !v.measures.every((m, i) => record(m)
    && m.id === ids[i] && ['result', 'lastYear', 'goal'].every(k => finite(m[k])) && score(m.score) && grades.includes(String(m.grade))
    && typeof m.met === 'boolean' && typeof m.exceeds === 'boolean')) return false;
  const o = v.overall;
  return record(o) && score(o.score) && grades.includes(String(o.grade)) && measures(o.binding) && measures(o.closeBehind)
    && finite(o.closeMargin) && typeof o.allMet === 'boolean' && typeof o.sacrifice === 'boolean'
    && Array.isArray(v.certificates) && v.certificates.length <= 10 && v.certificates.every(c => record(c)
      && ['exceeds', 'comeback', 'weathered', 'wellRounded'].includes(String(c.id)) && (c.measure === undefined || ids.includes(String(c.measure))));
}
/** Validate persisted output on read: a corrupt result must fail closed, not become UI data. */
export function isOutcome(v: unknown): v is Outcome {
  if (!record(v) || !isPlan(v.plan) || v.quarter !== '2194-Q1' || !record(v.totals) || !metrics(v.totals.plan) || !metrics(v.totals.holdCourse)
    || !record(v.reportCard) || !report(v.reportCard.plan) || !report(v.reportCard.holdCourse)) return false;
  if (!Array.isArray(v.monthly) || v.monthly.length !== 3 || !v.monthly.every((m, i) => record(m) && m.month === `2194-0${i + 1}`
    && record(m.plan) && record(m.holdCourse) && [m.plan.revenue, m.plan.units, m.holdCourse.revenue, m.holdCourse.units].every(finite))) return false;
  if (!Array.isArray(v.assumptions) || v.assumptions.length > 100 || !v.assumptions.every(a => record(a) && text(a.id) && text(a.text)
    && ['data', 'assumed', 'setup'].includes(String(a.source)) && typeof a.usedByPlan === 'boolean')) return false;
  if (!Array.isArray(v.happened) || v.happened.length > 32 || !v.happened.every(text)
    || !Array.isArray(v.discoveries) || v.discoveries.length > 3 || !v.discoveries.every(d => ['A', 'B', 'C'].includes(d))
    || new Set(v.discoveries).size !== v.discoveries.length || !record(v.facts) || !finite(v.facts.amount)) return false;
  return Object.entries(v.facts).every(([key, value]) => key === 'amount' || (['release', 'holdCourse', 'repick', 'events', 'sale'].includes(key)
    && record(value) && Object.values(value).every(finite)));
}
const discoveryList = (v: unknown) => Array.isArray(v) && v.length <= 3 && v.every(d => ['D', 'E', 'F'].includes(d)) && new Set(v).size === v.length;
/**
 * The stored result for a quarter: M1's Outcome for Q1; from Q2, Q2's shape with the quarter's own months, plus
 * the game's discoveries: D to F in Q2, none yet after it (endless.md section 5 is still to build).
 */
export function isQuarterOutcome(period: PlayedQuarter['period'], v: unknown): boolean {
  if (period === '2194-Q1') return isOutcome(v);
  const found = (v as { discoveries?: unknown } | null)?.discoveries;
  return isQ2Outcome(v, period) && (period === '2194-Q2' ? discoveryList(found) : Array.isArray(found) && found.length === 0);
}
