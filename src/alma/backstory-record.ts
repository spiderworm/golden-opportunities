// The station's backstory as the save keeps it (docs/design/backstory.md, section 8), and the save's check on
// its shape. The text checks are backstory.ts's; this file imports nothing but plain relative modules, since the
// save store also runs under plain Node (store.server.test.ts's processes).

export const BACKSTORY_FIELDS = ["damage", "deferral", "station", "short"] as const;
export type BackstoryField = (typeof BACKSTORY_FIELDS)[number];
/** Section 2's caps. */
export const BACKSTORY_LIMITS: Record<BackstoryField, number> = {
  damage: 240,
  deferral: 240,
  station: 200,
  short: 140,
};

/** Section 4's takes: the bosses' reason the game leans on, picked by the server from the seed. */
export const TAKES = ["blue_steel", "the_form", "terminal_free", "door_first"] as const;
export type Take = (typeof TAKES)[number];
/** Section 4's details: what hit, and what it hit. */
export const HITS = [
  "a cargo shuttle",
  "an ore tug",
  "a passenger shuttle",
  "a supply pod",
] as const;
export const STRUCK = [
  "the library annex",
  "the docking ring",
  "the library module",
  "the reading-room airlock",
] as const;

/** Why a field fails: a fixed list, so no model text ever reaches a failure code or a sent event. */
export const BACKSTORY_PROBLEMS = [
  "not_text",
  "empty",
  "too_long",
  "control",
  "emoji",
  "address",
  "markup",
  "quote",
  "voice",
  "number_or_direction",
  "ledger",
  "name",
  "person",
  "instruction",
  "zoolander",
  "alma",
  "third_person",
] as const;
export type BackstoryProblem = (typeof BACKSTORY_PROBLEMS)[number];

/** Every failure code a backstory can record. Append only: a saved record keeps its code. */
export const BACKSTORY_FAILURES: readonly string[] = [
  "not_json",
  "shape",
  "timeout",
  ...["missing", "broken", "timeout", "signed_out", "other"].map((k) => `unavailable:${k}`),
  ...BACKSTORY_FIELDS.flatMap((field) => BACKSTORY_PROBLEMS.map((p) => `text:${field}:${p}`)),
];

export interface BackstoryRecord {
  source: "alma" | "scripted";
  take: Take;
  details: { hit: string; struck: string };
  damage: string;
  deferral: string;
  station: string;
  short: string;
  /** The model that wrote it; absent for a scripted one. */
  model?: string;
  promptVersion: number;
  /** Model calls made: 0 when the model wasn't asked. */
  attempts: number;
  /**
   * Why the model's answer wasn't used, when it wasn't: one of BACKSTORY_FAILURES. On Alma's story written on the
   * retry (attempts 2), why the first answer was rejected (Probe's red-team after #244).
   */
  failure?: string;
}

const isPlain = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" &&
  v !== null &&
  !Array.isArray(v) &&
  Object.getPrototypeOf(v) === Object.prototype;
const shortText = (v: unknown, limit: number) => typeof v === "string" && v.length <= limit;
const smallInt = (v: unknown, max: number) =>
  Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max;

/**
 * The save's check on a stored backstory (Frank's validate()): its shape and bounds only. The text checks run
 * again on every load (backstory.ts), and a story that fails them falls back to the seeded one (section 7).
 */
export function isBackstoryRecord(value: unknown): value is BackstoryRecord {
  if (!isPlain(value)) return false;
  const required = ["source", "take", "details", ...BACKSTORY_FIELDS, "promptVersion", "attempts"];
  if (
    !required.every((k) => k in value) ||
    !Object.keys(value).every((k) => required.includes(k) || k === "model" || k === "failure")
  )
    return false;
  const { source, take, details, model, promptVersion, attempts, failure } = value;
  if (source !== "alma" && source !== "scripted") return false;
  if (!(TAKES as readonly unknown[]).includes(take)) return false;
  if (
    !isPlain(details) ||
    Object.keys(details).length !== 2 ||
    !(HITS as readonly unknown[]).includes(details.hit) ||
    !(STRUCK as readonly unknown[]).includes(details.struck)
  )
    return false;
  if (!BACKSTORY_FIELDS.every((f) => shortText(value[f], BACKSTORY_LIMITS[f]))) return false;
  if (model !== undefined && !shortText(model, 60)) return false;
  if (!smallInt(promptVersion, 1000) || !smallInt(attempts, 5)) return false;
  if (
    failure !== undefined &&
    !(typeof failure === "string" && BACKSTORY_FAILURES.includes(failure))
  )
    return false;
  return true;
}
