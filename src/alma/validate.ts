// Checks Alma's answer (endless.md section 9): exactly one JSON object `{ candidate, story, reason?, bossLine }`,
// a candidate of the three offered, a reason exactly when the quarter has an extra stretch, and every field's
// text checks. Alma's choice is checked against the rules again, though the server drew only fair candidates.

import { candidateProblem, recoveryOf, type Candidate, type QuarterContext } from "./candidates";
import { namesZoolander, textProblem, type TextField, type TextRules } from "./text";

export interface Flavor {
  story: string;
  reason?: string;
  bossLine: string;
}

export type Checked = { ok: true; index: number; flavor: Flavor } | { ok: false; failure: string };

const isPlain = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Whether the quarter's stretch needs Alma's reason: an extra stretch does; a recovery goal or none doesn't. */
export const wantsReason = (candidate: Candidate, context: QuarterContext) => candidate.stretch !== null && !recoveryOf(context);

/**
 * The model's text as one JSON object of the right shape, or why not. A single ```json fence is tolerated. The
 * text fields are folded once here (NFKC), so what's checked is what's stored (Frank's review of #170).
 */
export function parseAnswer(raw: string): { ok: true; candidate: unknown; fields: Record<"story" | "reason" | "bossLine", unknown> } | { ok: false; failure: string } {
  const body = raw.trim().replace(/^```(?:json)?\s*\n([\s\S]*)\n```$/, "$1");
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return { ok: false, failure: "not_json" };
  }
  if (!isPlain(value)) return { ok: false, failure: "shape" };
  const keys = Object.keys(value);
  if (!["candidate", "story", "bossLine"].every((k) => keys.includes(k)) || !keys.every((k) => ["candidate", "story", "reason", "bossLine"].includes(k))) return { ok: false, failure: "shape" };
  const fold = (v: unknown) => (typeof v === "string" ? v.normalize("NFKC") : v);
  return { ok: true, candidate: value.candidate, fields: { story: fold(value.story), reason: fold(value.reason), bossLine: fold(value.bossLine) } };
}

/** Parses and checks the model's answer against this quarter's candidates. */
export function checkAnswer(raw: string, candidates: readonly Candidate[], context: QuarterContext, rules: Pick<TextRules, "titles">): Checked {
  const parsed = parseAnswer(raw);
  if (!parsed.ok) return parsed;
  const index = parsed.candidate;
  if (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index >= candidates.length) return { ok: false, failure: "candidate" };
  const candidate = candidates[index];
  if (candidateProblem(candidate, context, { repeats: false })) return { ok: false, failure: "candidate" };
  const { story, reason, bossLine } = parsed.fields;
  if (wantsReason(candidate, context) !== (reason !== undefined)) return { ok: false, failure: "reason" };
  const fields: [TextField, unknown][] = [["story", story], ["bossLine", bossLine]];
  if (reason !== undefined) fields.push(["reason", reason]);
  for (const [field, text] of fields) {
    const problem = textProblem(field, text, { ...rules, candidate, quarter: context.quarter, zoolanderLast: namesZoolander(context.previous.at(-1)?.bossLine) });
    if (problem) return { ok: false, failure: `text:${field}:${problem}` };
  }
  return { ok: true, index, flavor: { story: story as string, ...(reason !== undefined ? { reason: reason as string } : {}), bossLine: bossLine as string } };
}
