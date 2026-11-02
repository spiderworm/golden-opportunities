// What Alma is told (endless.md section 9). The rules and the type list go in the system prompt; the game state
// goes in on stdin. Alma sees only past plans, scores, strikes and its own past choices: never anything the
// player typed, investigated or discovered, so nothing a player writes can reach it. `almaInput` picks the
// fields one by one, and a test pins them.

import { EVENT_TYPES, STRETCH_PERCENT, type MeasureId } from "./events";
import { TEXT_LIMITS } from "./text";
import type { ChoiceContext } from "./validate";

/** Recorded with each record, so a replay knows which rules wrote it. */
export const PROMPT_VERSION = 1;

/** One past quarter, as Alma may see it. */
export interface QuarterSummary {
  quarter: string;
  /** The plan as the ids of its fixed choices (levers, picked titles' ids). */
  plan: string[];
  scores: Record<MeasureId, number>;
  overall: number;
  grade: string;
  strike: boolean;
}

const describeType = (t: (typeof EVENT_TYPES)[number]) => {
  const params = Object.entries(t.params).map(([name, spec]) =>
    spec.kind === "enum" ? `${name}: one of ${spec.values.map((v) => JSON.stringify(v)).join(", ")}` : `${name}: a whole number from ${spec.min} to ${spec.max} (${spec.unit === "month" ? "the month of the quarter" : spec.unit})`,
  );
  return `- ${t.id}${params.length ? `: ${params.join("; ")}` : ": no params"}${t.mild ? " (mild)" : ""}${t.against.length ? `; works against ${t.against.join(" and ")}` : ""}${t.oncePer ? `; at most once in any ${t.oncePer} quarters` : ""}`;
};

export const ALMA_RULES = `You are Alma, the event director of Orbital Books, a bookstore game on a space station. Each quarter you choose one event and one measure to stretch, and write the memo's text. The player never meets you.

Choose one event type, with its params within these limits exactly:
${EVENT_TYPES.map(describeType).join("\n")}

Choose the stretch: a measure (profit, readers, happiness or culture) and a percent from ${STRETCH_PERCENT.min} to ${STRETCH_PERCENT.max}.

Rules:
- Never the same event type as last quarter, and never the same stretched measure as last quarter.
- Never an event that works against the stretched measure.
- If two or more strikes count against the player, choose only a mild event. A strike is the bosses' mark against the player for a quarter that scored under 70: not a labor strike. Never mention strikes or scores in your texts.
- Vary your choices across quarters and games: use every type, and the whole range of each limit, not the same values each time.
- If the input names a recovery measure, the stretch must be that measure, and its reason says it fell, with {{drop}}.

Write three texts:
- story: one or two sentences of plain prose for the memo, at most ${TEXT_LIMITS.story} characters, about what is happening on the station.
- stretch.reason: the bosses' reason for the stretch, in capitals, at most ${TEXT_LIMITS.reason} characters.
- bossLine: the bosses' line for the transmission, in capitals, at most ${TEXT_LIMITS.bossLine} characters. Only this line may mention Zoolander.

In all three, write no digits and no number words. Write every number as a slot: the name of a param in double braces ({{percent}}, {{cost}}, {{month}}), or {{stretch}} for the stretch's percent, {{quarter}} for the quarter, {{drop}} for a recovery's fall. Names from the lists may be slots too ({{genre}}). A slot is shown with its unit: {{percent}} reads "20%", {{cost}} reads "$250", {{month}} reads "August", {{quarter}} reads "Q3 2194". So write "a rise of {{percent}} in {{month}}", never "{{percent}} percent", "\${{cost}}" or "month {{month}}". No emoji, no email addresses, no @. Never name yourself: the player never meets Alma.

Answer with exactly one JSON object and nothing else:
{"type": "...", "params": {...}, "stretch": {"measure": "...", "percent": 0, "reason": "..."}, "story": "...", "bossLine": "..."}`;

/** The state Alma reads, as the JSON it receives. Only these fields, named one by one. */
export function almaInput(context: ChoiceContext, history: readonly QuarterSummary[]): string {
  return JSON.stringify({
    quarter: context.quarter,
    strikes: context.strikes,
    recovery: context.recovery ? { measure: context.recovery.measure } : null,
    history: history.map((q) => ({ quarter: q.quarter, plan: [...q.plan], scores: { ...q.scores }, overall: q.overall, grade: q.grade, strike: q.strike })),
    lastEvents: context.previous.map((r) => ({ quarter: r.quarter, type: r.type, params: { ...r.params }, stretch: { measure: r.stretch.measure, percent: r.stretch.percent } })),
  });
}
