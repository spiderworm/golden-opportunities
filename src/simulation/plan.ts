// Plans: shared by the Decide screen and the engine, so it imports nothing but types.
import { LEVER_IDS, MAX_LEVERS, Q2_LEVER_IDS, Q2_MAX_LEVERS, type LeverId, type Plan, type Q2Plan } from "./types.ts";

export const isLever = (value: unknown): value is LeverId => typeof value === "string" && (LEVER_IDS as readonly string[]).includes(value);

/** 0 to 2 distinct levers, in LEVER_IDS order, and nothing else on the object. */
export function isPlan(value: unknown): value is Plan {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  if (Object.keys(value).some((key) => key !== "levers")) return false;
  const levers = (value as { levers?: unknown }).levers;
  if (!Array.isArray(levers) || levers.length > MAX_LEVERS || !levers.every(isLever)) return false;
  return levers.every((lever, i) => i === 0 || LEVER_IDS.indexOf(levers[i - 1]) < LEVER_IDS.indexOf(lever));
}

/** A plan from a set of chosen levers, in any order; null if it isn't a valid plan. */
export function planOf(levers: readonly unknown[]): Plan | null {
  if (!levers.every(isLever)) return null;
  const plan = { levers: LEVER_IDS.filter((id) => levers.includes(id)) };
  return plan.levers.length === levers.length && isPlan(plan) ? plan : null;
}

export const has = (plan: Plan, lever: LeverId) => plan.levers.includes(lever);

/** Three months, each an ISBN or null with no ISBN twice; at most one lever; nothing else on the object. */
export function isQ2Plan(value: unknown): value is Q2Plan {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  if (Object.keys(value).some((key) => key !== "picks" && key !== "levers")) return false;
  const { picks, levers } = value as { picks?: unknown; levers?: unknown };
  if (!Array.isArray(picks) || picks.length !== 3) return false;
  if (!picks.every((p) => p === null || (typeof p === "string" && p.length > 0 && p.length <= 32))) return false;
  const chosen = picks.filter((p) => p !== null);
  if (new Set(chosen).size !== chosen.length) return false;
  return Array.isArray(levers) && levers.length <= Q2_MAX_LEVERS && levers.every((l) => (Q2_LEVER_IDS as readonly unknown[]).includes(l));
}
