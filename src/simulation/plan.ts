// Plans: shared by the Decide screen and the engine, so it imports nothing but types.
import { LEVER_IDS, MAX_LEVERS, type LeverId, type Plan } from "./types.ts";

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
