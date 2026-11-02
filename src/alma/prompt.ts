// What Alma is told (endless.md section 9). The rules go in the system prompt; the game state and this quarter's
// three candidates go in on stdin. Alma sees only past plans, scores, strikes and its own past choices: never
// anything the player typed, investigated or discovered, so nothing a player writes can reach it. `almaInput`
// picks the fields one by one, and a test pins them.

import type { Candidate, QuarterContext } from "./candidates";
import type { QuarterId } from "~/simulation/quarters";
import type { MeasureId } from "./events";
import { namesZoolander } from "./text";
import { quarterMonths } from "./names";
import { factSentence } from "./sentences";
import { TEXT_LIMITS } from "./text";
import { wantsReason } from "./validate";

/** Recorded with each record, so a replay knows which rules wrote it. */
export const PROMPT_VERSION = 2;

/** One past quarter, as Alma may see it. */
export interface QuarterSummary {
  quarter: QuarterId;
  /** The plan as the ids of its fixed choices (levers, picked titles' ids). */
  plan: string[];
  scores: Record<MeasureId, number>;
  overall: number;
  grade: string;
  strike: boolean;
}

export const ALMA_RULES = `You are the event director of Orbital Books, a bookstore game on a space station. The player never meets you.

Each quarter the game offers you three candidate events, each already set: its type, its details and the bosses' stretch goal. Choose one, and write its flavor. The game itself writes every fact for the player: what changes, by how much, when, and the stretch's size. You write only what surrounds the facts.

Write:
- story: one or two sentences of plain prose for the memo, at most ${TEXT_LIMITS.story} characters: a cause for the event, something happening on the station. The candidate's "fact" is the game's sentence that follows it: your cause must fit it.
- reason: only when the candidate says reasonWanted is true. The bosses' reason for the stretch goal, in capitals, at most ${TEXT_LIMITS.reason} characters. Leave the key out otherwise.
- bossLine: the bosses' line for the transmission, in capitals, at most ${TEXT_LIMITS.bossLine} characters. Only this line may mention Zoolander, and only sometimes: never when the input says zoolanderLast is true.

In every field:
- No numbers of any kind: no digits, no number words, no Roman numerals, no fractions, no $ or %.
- No directions or comparisons: not rise, fall, up, down, more, less, higher, lower, best, worst, surge, slump or the like. The fact sentence says which way things go.
- Name no genre, weekday, format or month except the chosen candidate's own, and no book title. You may leave them out.
- No emoji, no email addresses, no @, no braces. Never name yourself, and never a real person.
- "Strike" means the bosses' mark against the player for a weak quarter, not a labor strike. Never mention strikes or scores.

Answer with exactly one JSON object and nothing else:
{"candidate": 0, "story": "...", "reason": "...", "bossLine": "..."}`;

/** The state and candidates Alma reads, as the JSON it receives. Only these fields, named one by one. */
export function almaInput(context: QuarterContext, history: readonly QuarterSummary[], candidates: readonly Candidate[]): string {
  const months = quarterMonths(context.quarter);
  return JSON.stringify({
    quarter: context.quarter,
    strikes: context.strikes,
    zoolanderLast: namesZoolander(context.previous.at(-1)?.bossLine),
    history: history.map((q) => ({ quarter: q.quarter, plan: [...q.plan], scores: { ...q.scores }, overall: q.overall, grade: q.grade, strike: q.strike })),
    lastEvents: context.previous.map((r) => ({ quarter: r.quarter, type: r.type, params: { ...r.params }, stretch: r.stretch && { measure: r.stretch.measure } })),
    candidates: candidates.map((c, i) => ({
      candidate: i,
      type: c.type,
      params: { ...c.params, ...(typeof c.params.month === "number" ? { month: months[c.params.month - 1] } : {}) },
      stretch: c.stretch && { measure: c.stretch.measure, recovery: !wantsReason(c, context) },
      // The sentence the game puts after the story, so the flavor fits what happens (the live check: cheaper
      // fares were told as a burden).
      fact: factSentence({ quarter: context.quarter, ...c }),
      reasonWanted: wantsReason(c, context),
    })),
  });
}
