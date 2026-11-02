// Alma's flavor (endless.md section 9): `story` in plain prose, `reason` and `bossLine` in the bosses' capitals.
// Alma writes flavor, never facts: the server's sentences carry every figure and direction, so Alma's fields get
// Dewey's whole ban (no figures, no directions, no slots) and may name nothing the chosen candidate doesn't. A
// field that fails fails the whole answer: a story with a hole in it makes no sense, so nothing is dropped.

import { hasBannedWord } from "~/assistant/server/figures.server";
import { REDACTED, redactEmails } from "~/assistant/server/redact.server";
import type { Candidate } from "./candidates";
import { nameProblem } from "./names";

export type TextField = "story" | "reason" | "bossLine";

export const TEXT_LIMITS: Record<TextField, number> = { story: 240, reason: 120, bossLine: 160 };

/** Why a field fails: a fixed list, so no model text ever reaches a failure code or a sent event. */
export const TEXT_PROBLEMS = ["not_text", "empty", "too_long", "control", "emoji", "address", "slot", "number_or_direction", "voice", "zoolander", "alma", "name"] as const;
export type TextProblem = (typeof TEXT_PROBLEMS)[number];

export interface TextRules {
  candidate: Candidate;
  quarter: string;
  /** The catalog's titles: none may be named. */
  titles: readonly string[];
  /** Last quarter's boss line named Zoolander, so this one may not: odd, not constant, is the joke (Plot). */
  zoolanderLast?: boolean;
}

export const namesZoolander = (text: string | undefined) => /zoolander/i.test(text ?? "");

/** Why a field fails, or null if it passes. Alma's answer is folded once when it's parsed, so this is what's stored. */
export function textProblem(field: TextField, text: unknown, rules: TextRules): TextProblem | null {
  if (typeof text !== "string") return "not_text";
  if (!text.trim()) return "empty";
  if (text.length > TEXT_LIMITS[field]) return "too_long";
  if (/[\p{Cc}\p{Cf}]/u.test(text)) return "control";
  if (/\p{Extended_Pictographic}/u.test(text)) return "emoji";
  // Claude Code puts the account's email in the model's context; no address, placeholder or @ may reach a player.
  if (text.includes("@") || text.includes(REDACTED) || redactEmails(text) !== text) return "address";
  if (text.includes("{{") || text.includes("}}")) return "slot";
  if (hasBannedWord(text)) return "number_or_direction";
  const capitals = field !== "story";
  if (capitals ? /\p{Ll}/u.test(text) : !/\p{Ll}/u.test(text)) return "voice";
  // Zoolander belongs to the bosses' lines only (David's direction, collaboration log).
  if (namesZoolander(text) && (field !== "bossLine" || rules.zoolanderLast)) return "zoolander";
  // Alma is behind the scenes: the player never meets her.
  if (/\balma\b/iu.test(text)) return "alma";
  if (nameProblem(text, rules.candidate, rules.quarter, rules.titles, capitals)) return "name";
  return null;
}
