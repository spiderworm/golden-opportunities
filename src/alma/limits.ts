// Alma's text limits and failure problems, apart from the checks themselves: the save's check (record.ts) needs
// them, and the save store also runs under plain Node (store.server.test.ts's processes), so this file and
// record.ts import nothing but plain relative modules.

export type TextField = "story" | "reason" | "bossLine";

export const TEXT_LIMITS: Record<TextField, number> = { story: 240, reason: 120, bossLine: 160 };

/** Why a field fails: a fixed list, so no model text ever reaches a failure code or a sent event. */
export const TEXT_PROBLEMS = ["not_text", "empty", "too_long", "control", "emoji", "address", "slot", "number_or_direction", "voice", "zoolander", "alma", "name"] as const;
export type TextProblem = (typeof TEXT_PROBLEMS)[number];
