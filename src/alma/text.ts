// Alma's three text fields (endless.md section 9): `story` in plain prose, `stretch.reason` and `bossLine` in the
// bosses' capitals. Numbers appear only as slots (`{{percent}}`), which the server renders from the checked
// params, the way Dewey's figures come only from refs. Everything else is checked here, and a field that fails
// fails the whole record: a story with a hole in it makes no sense, so nothing is dropped.

import { NUMBER_BAN } from "~/assistant/server/figures.server";
import { redactEmails } from "~/assistant/server/redact.server";

export type TextField = "story" | "reason" | "bossLine";

export const TEXT_LIMITS: Record<TextField, number> = { story: 280, reason: 120, bossLine: 160 };

const SLOT = /\{\{([a-z_]{1,20})\}\}/g;
const fold = (text: string) => text.normalize("NFKC");

/** Why a field fails, or null if it passes. `slots` are the names it may cite. */
export function textProblem(field: TextField, value: unknown, slots: ReadonlySet<string>): string | null {
  if (typeof value !== "string") return "not text";
  const text = fold(value);
  if (!text.trim()) return "empty";
  if (text.length > TEXT_LIMITS[field]) return "too long";
  if (/[\p{Cc}\p{Cf}]/u.test(text)) return "control characters";
  if (/\p{Extended_Pictographic}/u.test(text)) return "emoji";
  // Claude Code puts the account's email in the model's context; no address, and no @ at all, may reach a player.
  if (text.includes("@") || redactEmails(text) !== text) return "an email address";
  let unknown = false;
  const prose = text.replace(SLOT, (_, name: string) => {
    if (!slots.has(name)) unknown = true;
    return " ";
  });
  if (unknown) return "an unknown slot";
  if (NUMBER_BAN.test(prose)) return "a number outside a slot";
  if (field === "story" && !/\p{Ll}/u.test(prose)) return "not plain prose";
  if (field !== "story" && /\p{Ll}/u.test(prose)) return "not in capitals";
  // Zoolander belongs to the bosses' lines only (David's direction, collaboration log).
  if (field !== "bossLine" && /zoolander/i.test(prose)) return "Zoolander outside the boss line";
  return null;
}

/** A field with its slots filled in. Only call it on text that passed `textProblem`. */
export function renderText(text: string, values: Readonly<Record<string, string>>): string {
  return fold(text).replace(SLOT, (_, name: string) => values[name] ?? "");
}
