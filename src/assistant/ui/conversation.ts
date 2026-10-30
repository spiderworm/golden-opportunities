// The conversation with the assistant, kept in this browser so a reload doesn't lose it (David, 30 Oct 2026:
// "Dewey conversation should be restored on page reload"). It's the player's own device keeping their own
// conversation, exactly as it was shown: questions, replies, lookup tables with their sources, pin
// acknowledgements and withheld notes. Keyed by this copy's instance ID until saves exist (Frank's save layer
// will replace it). Storage can be missing, full or disabled, so every access is wrapped: the panel works
// the same without it.

import type { SentTurn } from "./stream.ts";

/** The parts of a reply this module needs; the panel's own type has more. */
export interface StoredReply {
  question: string;
  text: string;
  lookups: unknown[];
  error?: string;
  state: string;
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

const isReply = (r: unknown): r is StoredReply => {
  if (!r || typeof r !== "object") return false;
  const { question, text, lookups, error, state } = r as Record<string, unknown>;
  return typeof question === "string" && typeof text === "string" && Array.isArray(lookups) && (error === undefined || typeof error === "string") && typeof state === "string";
};

/**
 * Restores the conversation. An answer that was still streaming when the page went away comes back marked
 * interrupted, never passed off as complete. Anything unreadable is treated as no conversation.
 */
export function loadConversation<R extends StoredReply>(storage: Storage | undefined, instance: string): R[] {
  try {
    const raw = storage?.getItem(storageKey(instance));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every(isReply)) return [];
    return parsed.slice(-MAX_TURNS).map((r) => (r.state === "streaming" ? { ...r, state: INTERRUPTED } : r)) as R[];
  } catch {
    return [];
  }
}

/**
 * Keeps the last MAX_TURNS turns. If storage is full, keeps as many of the latest as fit; if none fit, or
 * storage fails, it keeps nothing and says so. Returns how many turns were kept.
 */
export function saveConversation(storage: Storage | undefined, instance: string, replies: readonly StoredReply[]): number {
  if (!storage) return 0;
  const key = storageKey(instance);
  for (let turns = Math.min(replies.length, MAX_TURNS); turns > 0; turns = Math.floor(turns / 2)) {
    try {
      storage.setItem(key, JSON.stringify(replies.slice(-turns)));
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
 * What the model is told of earlier turns: the questions and the replies as they were shown (rendered text,
 * never refs; lookups never), as before. An interrupted answer is described, not quoted half-way.
 */
export function historyFor(replies: readonly StoredReply[]): SentTurn[] {
  return replies.flatMap((r) => [
    { role: "player" as const, text: r.question },
    { role: "assistant" as const, text: r.state === INTERRUPTED ? "(This answer was interrupted before it finished.)" : r.text },
  ]);
}
