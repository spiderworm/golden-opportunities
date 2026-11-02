// Alma's three text fields (endless.md section 9): `story` in plain prose, `stretch.reason` and `bossLine` in the
// bosses' capitals. Numbers appear only as slots (`{{percent}}`), which the server renders from the checked
// params, the way Dewey's figures come only from refs. Everything else is checked here, and a field that fails
// fails the whole record: a story with a hole in it makes no sense, so nothing is dropped.

import { hasNumber } from "~/assistant/server/figures.server";
import { REDACTED, redactEmails } from "~/assistant/server/redact.server";

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
  // The stream redacts an address before Alma's text is read; its placeholder is refused too (Audit's review).
  if (text.includes("@") || text.includes(REDACTED) || redactEmails(text) !== text) return "an email address";
  let unknown = false;
  const prose = text.replace(SLOT, (_, name: string) => {
    if (!slots.has(name)) unknown = true;
    return " ";
  });
  if (unknown) return "an unknown slot";
  // A slot renders with its unit ("20%", "$250", "August"), so a unit beside it would be said twice.
  if (/\}\}\s*(?:%|per\s?cent\b|dollars?\b)|(?:\$|\bmonth(?:\s+of)?)\s*\{\{/iu.test(text)) return "a unit beside a slot";
  // Alma is behind the scenes: the player never meets her.
  if (/\balma\b/iu.test(prose)) return "names Alma";
  if (hasNumber(prose)) return "a number outside a slot";
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
