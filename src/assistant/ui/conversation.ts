// The conversation with the assistant, kept in this browser so a reload doesn't lose it (David, 30 Oct 2026:
// "Dewey conversation should be restored on page reload"). It's the player's own device keeping their own
// conversation, exactly as it was shown: questions, replies, lookup tables with their sources, pin
// acknowledgements and withheld notes. Keyed by this copy's instance ID until saves exist (Frank's save layer
// will replace it). Storage can be missing, full or disabled, so every access is wrapped: the panel works
// the same without it.
//
// What's stored is the player's to edit, so it's trusted only as far as that matters (Audit, #41): every turn
// is checked against the shape the panel wrote, and one that doesn't fit is dropped; restored text is shown
// as plain text (a stored "{{a1}}" stays literally that); and the server treats all history from the browser,
// restored or not, as the player's data, never as the assistant's own words. Editing it changes only what this
// player sees on their own screen; a stored lookup's pin is checked again by Investigate and run as the player's
// own query, so editing one pins only what the player could look up anyway. Keeping the conversation in the server-side save is the cleaner end state, once saves exist.

import type { SentTurn } from "./stream.ts";
import { isGameKey, isQuarter } from "./timeline.ts";

/** The parts of a reply this module needs; the panel's own type has more. */
export interface StoredReply {
  question: string;
  text: string;
  lookups: unknown[];
  error?: string;
  state: string;
  /** The quarter it was asked in ("2194-Q2"), for the timeline; absent on a reply kept before. */
  quarter?: string;
  /** The game it was asked in (timeline.ts's isGameKey); absent on a reply kept before. */
  game?: string;
}

/** How many turns are kept: the oldest go first. */
export const MAX_TURNS = 50;
/** What an answer still streaming when the page went away is restored as. */
export const INTERRUPTED = "interrupted";

export const storageKey = (instance: string) => `orbital.assistant.conversation.${instance}`;

/** The browser's localStorage, or undefined where there is none (server rendering) or it's blocked. */
export function browserStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

const STATES = ["done", "stopped", "failed", "streaming", INTERRUPTED];
const TEXT_MAX = 20_000;
const ROWS_MAX = 200;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown, max = TEXT_MAX): v is string => typeof v === "string" && v.length <= max;
const only = (o: Obj, keys: string[]) => Object.keys(o).every((k) => keys.includes(k));
const isCell = (v: unknown) =>
  v === null || isStr(v, 1_000) || (typeof v === "number" && Number.isFinite(v));
const isColumn = (c: unknown) =>
  isObj(c) &&
  only(c, ["key", "label", "type", "nullable"]) &&
  isStr(c.key, 100) &&
  isStr(c.label, 200) &&
  (c.type === "string" || c.type === "number") &&
  typeof c.nullable === "boolean";
const isTable = (l: Obj) =>
  Array.isArray(l.columns) &&
  l.columns.length <= 10 &&
  l.columns.every(isColumn) &&
  Array.isArray(l.rows) &&
  l.rows.length <= ROWS_MAX &&
  l.rows.every((r) => isObj(r) && Object.values(r).every(isCell)) &&
  isStr(l.source, 5_000);
const isFigures = (t: unknown) => isObj(t) && Object.values(t).every(isCell);
/** One figure's evidence: how many it's over, and its standard error or null (query/evidence.ts). */
const isOneEvidence = (e: unknown) =>
  isObj(e) &&
  only(e, ["n", "se"]) &&
  Number.isSafeInteger(e.n) &&
  (e.n as number) >= 0 &&
  (e.se === null || (typeof e.se === "number" && Number.isFinite(e.se) && e.se >= 0));
const UNITS = [null, "orders", "sale lines", "ratings", "days"];
/** A lookup's evidence, strictly: absent, or a known unit and one entry per row of the lookup, and a total's. */
const isEvidence = (e: unknown, rows: number) =>
  e === undefined ||
  (isObj(e) &&
    only(e, ["unit", "rows", "total"]) &&
    UNITS.includes(e.unit as string | null) &&
    Array.isArray(e.rows) &&
    e.rows.length === rows &&
    e.rows.every(isOneEvidence) &&
    isOneEvidence(e.total));
/** A lookup's pin, loosely: Investigate checks it fully (parsePinSpec) before pinning, and runs it as a query. */
const isPin = (p: unknown) =>
  p === undefined ||
  (isObj(p) &&
    isStr(p.title, 200) &&
    (((p.kind === "table" || p.kind === "bar" || p.kind === "line") &&
      only(p, ["title", "kind", "query"]) &&
      isObj(p.query)) ||
      (p.kind === "comparison" &&
        only(p, ["title", "kind", "comparison"]) &&
        isObj(p.comparison))));
const isChart = (c: unknown) =>
  isObj(c) &&
  only(c, ["title", "kind", "query"]) &&
  isStr(c.title, 200) &&
  isStr(c.kind, 20) &&
  isObj(c.query);

/** One lookup as the panel stored it: a table with its source, a failed lookup, or a pin acknowledgement. */
function isLookup(l: unknown): boolean {
  if (!isObj(l)) return false;
  if (l.type === "data")
    return (
      only(l, ["type", "columns", "rows", "total", "source", "query", "pin", "evidence"]) &&
      isEvidence(l.evidence, Array.isArray(l.rows) ? l.rows.length : -1) &&
      (l.query === undefined || isObj(l.query)) &&
      isPin(l.pin) &&
      isTable(l) &&
      (l.total === null || (typeof l.total === "number" && Number.isFinite(l.total)))
    );
  if (l.type === "chart")
    return (
      only(l, ["type", "chart", "columns", "rows", "total", "source", "pin", "evidence"]) &&
      isEvidence(l.evidence, Array.isArray(l.rows) ? l.rows.length : -1) &&
      isChart(l.chart) &&
      ["bar", "line"].includes((l.chart as Obj).kind as string) &&
      isPin(l.pin) &&
      isTable(l) &&
      (l.total === null || (typeof l.total === "number" && Number.isFinite(l.total)))
    );
  if (l.type === "comparison")
    return (
      only(l, ["type", "columns", "rows", "total", "labels", "source", "pin"]) &&
      isPin(l.pin) &&
      isTable(l) &&
      isFigures(l.total)
    );
  if (l.type === "lookup_failed") return only(l, ["type", "message"]) && isStr(l.message, 300);
  if (l.type === "pin")
    return (
      only(l, ["type", "chart", "source", "placed"]) &&
      isChart(l.chart) &&
      isStr(l.source, 5_000) &&
      typeof l.placed === "boolean"
    );
  return false;
}

/**
 * The model's own tool input, which some lookups carry, is never kept: only what was shown. A lookup's pin is
 * kept: it's that input as the tool server checked it, titled from its parts, and Investigate checks it again
 * and runs it as the player's own query before showing anything.
 */
const withoutQuery = <R extends StoredReply>(r: R): R => ({
  ...r,
  lookups: r.lookups.map((l) =>
    isObj(l) && "query" in l ? (({ query: _, ...rest }) => rest)(l) : l,
  ),
});

/** A turn exactly as the panel stored it; anything else (null lookups, extra fields, wrong types) isn't. */
function isReply(r: unknown): r is StoredReply {
  return (
    isObj(r) &&
    only(r, ["question", "text", "lookups", "error", "state", "quarter", "game"]) &&
    // The quarter it was asked in, for the timeline (timeline.ts); a reply kept before that has none.
    (r.quarter === undefined || isQuarter(r.quarter)) &&
    (r.game === undefined || isGameKey(r.game)) &&
    isStr(r.question, 1_000) &&
    isStr(r.text) &&
    Array.isArray(r.lookups) &&
    r.lookups.length <= 20 &&
    r.lookups.every(isLookup) &&
    (r.error === undefined || isStr(r.error, 500)) &&
    STATES.includes(r.state as string)
  );
}

/**
 * Restores the conversation. An answer that was still streaming when the page went away comes back marked
 * interrupted, never passed off as complete. Anything unreadable is treated as no conversation.
 */
export function loadConversation<R extends StoredReply>(
  storage: Storage | undefined,
  instance: string,
): R[] {
  try {
    const raw = storage?.getItem(storageKey(instance));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Turns that don't fit are dropped.
    return parsed
      .filter(isReply)
      .slice(-MAX_TURNS)
      .map((r) =>
        withoutQuery({ ...r, state: r.state === "streaming" ? INTERRUPTED : r.state }),
      ) as R[];
  } catch {
    return [];
  }
}

/**
 * Keeps the last MAX_TURNS turns. If storage is full, keeps as many of the latest as fit; if none fit, or
 * storage fails, it keeps nothing and says so. Returns how many turns were kept.
 */
export function saveConversation(
  storage: Storage | undefined,
  instance: string,
  replies: readonly StoredReply[],
): number {
  if (!storage) return 0;
  const key = storageKey(instance);
  for (let turns = Math.min(replies.length, MAX_TURNS); turns > 0; turns = Math.floor(turns / 2)) {
    try {
      storage.setItem(key, JSON.stringify(replies.slice(-turns).map(withoutQuery)));
      return turns;
    } catch {
      // Full, most likely: try fewer.
    }
  }
  clearConversation(storage, instance);
  return 0;
}

export function clearConversation(storage: Storage | undefined, instance: string) {
  try {
    storage?.removeItem(storageKey(instance));
  } catch {
    // Nothing to do: the panel is cleared either way.
  }
}

/**
 * What the model is told of earlier turns: the questions and the replies as they were shown (rendered text;
 * lookups never), as before. The server treats all of it as the player's data. An interrupted answer is
 * described, not quoted half-way.
 */
export function historyFor(replies: readonly StoredReply[]): SentTurn[] {
  return replies.flatMap((r) => [
    { role: "player" as const, text: r.question },
    {
      role: "assistant" as const,
      text: r.state === INTERRUPTED ? "(This answer was interrupted before it finished.)" : r.text,
    },
  ]);
}
