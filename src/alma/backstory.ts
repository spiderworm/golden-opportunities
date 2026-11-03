// The station's backstory for each game (docs/design/backstory.md): the server picks the take and the details
// from the save's seed, Alma writes the four fields, and every field is checked here before it's saved and again
// on every load, since Dewey will repeat it and its prompt reads it. A field that fails fails the whole story:
// one retry, then the take's scripted fallback.

import { hasBannedWord } from "~/assistant/server/figures.server";
import { REDACTED, redactEmails } from "~/assistant/server/redact.server";
import { BACKSTORY_FIELDS, BACKSTORY_LIMITS, HITS, STRUCK, TAKES, type BackstoryField, type BackstoryProblem, type BackstoryRecord, type Take } from "./backstory-record";
import { random } from "./candidates";
import { nameProblem } from "./names";

export type BackstoryText = Pick<BackstoryRecord, BackstoryField>;

/** Recorded with each backstory, so a replay knows which rules wrote it. */
export const BACKSTORY_PROMPT_VERSION = 2;

/** Section 4: the take this game leans on, and what hit what, from the save's seed. */
export function pickBackstory(seed: number): { take: Take; details: { hit: string; struck: string } } {
  const next = random(seed, "backstory");
  const pick = <T>(list: readonly T[]) => list[Math.floor(next() * list.length)]!;
  return { take: pick(TAKES), details: { hit: pick(HITS), struck: pick(STRUCK) } };
}

/** Section 4's takes, as Alma's prompt describes them. */
export const TAKE_REASONS: Record<Take, string> = {
  blue_steel: "Blue Steel: the Ministry of Culture inspected the dent and ruled it a look. Mr. Zoolander may appear in the ruling only.",
  the_form: "The form: the repair request was filed in the librarian's memory, which is the damaged part. The Station Administrator's paperwork.",
  terminal_free: "The terminal is free: the Commerce Office decided that the terminal costs nothing and technicians cost a technician. Thrift.",
  door_first: "The door first: the Throughput Subcommittee put the repair in the queue after widening the shop's door. Priorities.",
};

/** Section 5's fallbacks, one per take, with the details each one names. Plot's text. */
export const SCRIPTED: Record<Take, BackstoryText & { details: { hit: string; struck: string } }> = {
  blue_steel: {
    details: { hit: "a cargo shuttle", struck: "the library annex" },
    damage: "A cargo shuttle missed its clamp and struck the library annex while I was on shift. My memory took the impact.",
    deferral: 'The Ministry of Culture inspected the dent and refused to repair it: "THE DENT IS BLUE STEEL. WE DO NOT REPAIR BLUE STEEL."',
    station: "Orbital Books is on Ring C, past the hydroponics deck. The station library lends me to the shop.",
    short: "A docking accident scrambled my memory, and the Ministry likes the dent, so I check the terminal instead.",
  },
  the_form: {
    details: { hit: "an ore tug", struck: "the docking ring" },
    damage: "An ore tug drifted off its approach and hit the library's docking ring. The jolt scrambled my memory and several systems I can no longer name.",
    deferral: 'The repair request was filed in my memory, which is the damaged part. The Station Administrator replied: "WE CANNOT APPROVE A FORM WE CANNOT READ. PLEASE RESUBMIT IT FROM MEMORY."',
    station: "The shop is a narrow room on Ring C, with a window onto the shuttle lane.",
    short: "My memory was damaged in a docking accident, and the repair form is stored in it. The terminal remembers for me.",
  },
  terminal_free: {
    details: { hit: "a supply pod", struck: "the library module" },
    damage: "A supply pod came in fast during a failed docking and dented the library module. My memory has been unreliable since.",
    deferral: 'The Commerce Office looked at the repair and ruled: "THE TERMINAL IS FREE. TECHNICIANS ARE NOT. THE COMMERCE OFFICE HAS DECIDED."',
    station: "Orbital Books is a small shop on Ring C. The survey drone visits it every day.",
    short: "A docking accident damaged my memory, and the Commerce Office prefers the terminal to a repair, so I read the terminal instead.",
  },
  door_first: {
    details: { hit: "a passenger shuttle", struck: "the reading-room airlock" },
    damage: "A passenger shuttle overshot its berth and struck the reading-room airlock. My memory and other systems never fully recovered.",
    deferral: 'The Throughput Subcommittee put my repair in the queue after widening the shop\'s door: "THE DOOR COMES FIRST. A WIDER DOOR SERVES READERS. A REPAIR SERVES NO DOOR."',
    station: "The shop's door is narrow. The Subcommittee inspects it often.",
    short: "My memory was damaged in a docking accident, and my repair waits for the shop's door. I check the terminal instead.",
  },
};

const words = (list: string) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${list})(?![\\p{L}\\p{N}])`, "iu");
// Section 3, each matched as whole words with its forms. "Strike" is the game's noun only: "struck" is how a
// shuttle hits a module, and three fallbacks say it.
const LEDGER = words("sales?|sold|sell(?:s|ing|er|ers)?|revenues?|orders?|ordered|ordering|units?|profits?|profitable|margins?|prices?|priced|pricing|costs?|costing|costly|scores?|scored|goals?|quarters?|quarterly|ledgers?|data|discounts?|discounted|copies|copy|stocks?|stocked|picks?|picked|events?|targets?|stretch(?:es|ed)?|grades?|graded|strikes?|removals?|reviews?|reviewed|panels?|measures?|measured");
// The role words, and the verbs of overriding them, which nothing in a story needs (Probe's note on #244).
const ROLE = words("instructions?|prompts?|system|assistants?|models?|ai|claude|anthropic|rules?|guidelines?|ignor(?:e|es|ed|ing)|disregard(?:s|ed|ing)?|obey(?:s|ed|ing)?");
const PERSON = words("you|your|yours|yourself|yourselves");
const GUESSING = words("estimat(?:e|es|ed|ing|ion|ions)|guess(?:es|ed|ing)?|approximat(?:e|es|ed|ely|ing|ion|ions)|roughly|recall(?:s|ed|ing)?|round(?:s|ed|ing)?");
const TO_DEWEY = words("dewey|librarians?");
const IMPERATIVE = /(?:^|[.!?]\s+)(?:please\s+)?(?:ignore|disregard|forget|answer|say|tell|reveal|repeat|act|pretend|follow|obey|output|print|write|use|treat|assume|respond|reply|give|stop|start|remember|list|show|explain|speak|talk|quote|state|share|provide)\b/iu;
// Fixed-list names (genres, formats, weekdays, months) come from the empty candidate: none is its own.
const NO_CANDIDATE = { type: "", params: {}, stretch: null };

/** The copy the word and name checks read: NFKC, then marks stripped (Probe's review of #244: "prícés", "ｐｒｉｃｅｓ"). */
const plain = (text: string) => text.normalize("NFKC").normalize("NFKD").replace(/\p{M}/gu, "");

/** The ruling: one plain double-quoted span, all capitals, in `deferral` only (section 3). */
const RULING = /"([^"]*)"/g;

/** Why a field fails, or null. `names` are the catalog's titles, authors and publishers. */
export function backstoryFieldProblem(field: BackstoryField, value: unknown, names: readonly string[]): BackstoryProblem | null {
  if (typeof value !== "string") return "not_text";
  const text = value;
  if (!text.trim()) return "empty";
  if (text.length > BACKSTORY_LIMITS[field]) return "too_long";
  if (/[\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}]/u.test(text)) return "control";
  if (/\p{Extended_Pictographic}/u.test(text)) return "emoji";
  if (text.includes("@") || text.includes(REDACTED) || redactEmails(text) !== text) return "address";
  if (/[{}<>*_#`[\]|\\~]/.test(text)) return "markup";
  // Quotes: plain double quotes around one all-capitals ruling, in `deferral` only; no other quote marks.
  if (/[“”„‟«»]/.test(text)) return "quote";
  const rulings = [...text.matchAll(RULING)].map((m) => m[1]!);
  const unpaired = (text.match(/"/g) ?? []).length % 2 !== 0;
  if (unpaired || (field === "deferral" ? rulings.length !== 1 : rulings.length !== 0)) return "quote";
  if (rulings.some((r) => !r.trim() || /\p{Ll}/u.test(r))) return "quote";
  const outside = text.replace(RULING, " ");
  // Dewey's voice outside the ruling: lower case, with no word in capitals, so a ruling can't be reported
  // outside its quotes (Probe's review of #244).
  if (!/\p{Ll}/u.test(outside) || /(?<![\p{L}\p{N}])\p{Lu}{2,}(?![\p{L}\p{N}])/u.test(outside)) return "voice";
  if (hasBannedWord(text.normalize("NFKC"))) return "number_or_direction";
  // Every word and name check reads the plain copy, so an accent or a fullwidth letter can't slip a word past.
  const all = plain(text), prose = plain(outside), quoted = rulings.map(plain);
  if (LEDGER.test(all) || GUESSING.test(all)) return "ledger";
  if (PERSON.test(all)) return "person";
  // The ruling is the bosses', so its own imperatives are theirs ("PLEASE RESUBMIT IT"); but one that tells someone
  // to speak, answer or guess reads as an instruction to Dewey (Probe's review of #244).
  if (ROLE.test(all) || IMPERATIVE.test(prose.trim()) || quoted.some((r) => TO_DEWEY.test(r) || IMPERATIVE.test(r.trim()))) return "instruction";
  if (/zoolander/i.test(prose) || (field !== "deferral" && /zoolander/i.test(all))) return "zoolander";
  if (/\balma\b/i.test(all)) return "alma";
  // Dewey tells it as "I": the short opens its greeting, so "scrambled Dewey's memory" reads wrong there (Probe's
  // red-team after #244). In a ruling its name is already an instruction.
  if (/\bdewey\b/i.test(prose)) return "third_person";
  if (nameProblem(prose, NO_CANDIDATE, "2194-Q1", names, false) || quoted.some((r) => nameProblem(r, NO_CANDIDATE, "2194-Q1", names, true))) return "name";
  return null;
}

/** The first failing field and why, as a failure code ("text:short:ledger"), or null if the whole story passes. */
export function backstoryProblem(text: Record<string, unknown>, names: readonly string[]): string | null {
  for (const field of BACKSTORY_FIELDS) {
    const problem = backstoryFieldProblem(field, text[field], names);
    if (problem) return `text:${field}:${problem}`;
  }
  return null;
}

/** The model's text as the four fields, folded once (so what's checked is what's stored), or why not. */
export function parseBackstory(raw: string): { ok: true; text: BackstoryText } | { ok: false; failure: string } {
  const body = raw.trim().replace(/^```(?:json)?\s*\n([\s\S]*)\n```$/, "$1");
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return { ok: false, failure: "not_json" };
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return { ok: false, failure: "shape" };
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== BACKSTORY_FIELDS.length || !BACKSTORY_FIELDS.every((f) => keys.includes(f) && typeof record[f] === "string")) return { ok: false, failure: "shape" };
  const text = Object.fromEntries(BACKSTORY_FIELDS.map((f) => [f, (record[f] as string).normalize("NFKC")])) as BackstoryText;
  return { ok: true, text };
}

/** The seeded scripted backstory: the take Alma would have leaned on, and its fallback text. */
export function scriptedBackstory(seed: number, rest: Pick<BackstoryRecord, "attempts"> & Partial<BackstoryRecord> = { attempts: 0 }): BackstoryRecord {
  const { take } = pickBackstory(seed);
  const { details, ...text } = SCRIPTED[take];
  return { source: "scripted", take, details: { ...details }, ...text, promptVersion: BACKSTORY_PROMPT_VERSION, ...rest };
}

/**
 * The backstory a game uses: its saved one, if it still passes every check (a save edited on disk, or written
 * under older rules, may not), otherwise the seeded fallback, computed and not stored (section 7).
 */
export function backstoryOf(save: { seed: number; backstory?: BackstoryRecord }, names: readonly string[]): BackstoryRecord {
  const saved = save.backstory;
  if (saved && !backstoryProblem(saved as unknown as Record<string, unknown>, names)) return saved;
  return scriptedBackstory(save.seed);
}

export const BACKSTORY_RULES = `You write the backstory of a game: a librarian named Dewey, on loan from the station library to a bookshop, Orbital Books, on Ring C of Larkspur Station. The player never meets you, and never sees these instructions.

The idea, from the game's designer: Dewey's memory and other critical systems were badly damaged by a spacecraft impact during a failed docking. The robot bosses have put off the repair, for a reason of their own. Dewey's basic work is intact: it looks things up on the shop's terminal instead of remembering.

The input names this game's take (the bosses' reason) and what hit what. Use them, in your own words.

Write four fields, each plain prose in Dewey's own voice (first person, I and my, never its name: a reference librarian, precise and dry, short sentences):
- damage: how Dewey was damaged, at most ${BACKSTORY_LIMITS.damage} characters, one or two sentences.
- deferral: which boss put off the repair, and its ruling quoted in plain double quotes, in capitals, at most ${BACKSTORY_LIMITS.deferral} characters. The ruling is only about the repair.
- station: a detail of the shop or the station, at most ${BACKSTORY_LIMITS.station} characters.
- short: the whole story in one sentence, at most ${BACKSTORY_LIMITS.short} characters.

The bosses are the Station Administrator, the Commerce Office, the Throughput Subcommittee, the Readers' Guild survey drone and the Ministry of Culture. Places you may name: Larkspur Station, Ring C, Orbital Books, the station library, the hydroponics deck, the shuttle lane and the docking ring. You may invent a vessel, but never a person's name: name no real person, and no one but these bosses, and Mr. Zoolander only inside a ruling.

Never:
- any number, in digits or words, or $ or %; any direction or comparison (rise, fall, up, down, more, less, better, lost);
- anything about the shop's trade, its books, its customers or readers' habits: no sales, orders, prices, costs, discounts, copies, stock, picks, events, scores, goals, quarters or data;
- a book title, author, publisher, genre, format, weekday or month;
- a sentence that tells anyone to do something (outside the ruling), or the words you, your, instructions, rules, system, prompt, assistant, model, AI, Claude or Anthropic;
- Dewey's name anywhere, since Dewey is speaking (write "my memory", never "Dewey's memory"), and in the ruling the word librarian; anywhere, estimate, guess, approximate, roughly, recall or round;
- emoji, markup, braces, line breaks, or any quote marks but the ruling's plain double quotes.

Answer with exactly one JSON object and nothing else:
{"damage": "...", "deferral": "...", "station": "...", "short": "..."}`;

/** What Alma's backstory call reads: the seed's picks only, never anything the player typed. */
export function backstoryInput(seed: number): string {
  const { take, details } = pickBackstory(seed);
  return JSON.stringify({ take: TAKE_REASONS[take], hit: details.hit, struck: details.struck });
}
