// How much evidence is behind Dewey's lookups, for his panel and never for his model (Goldy's and Chart's design,
// after #337). The model sees a lookup's evidence only flattened, cited by ref (n, a likely range, a noise flag); the
// panel draws it as Investigate does, from the raw evidence with its standard errors. Under Claude Code the model
// receives the tool server's whole output, so the raw evidence can't travel there: the query handler keeps it here,
// for the answer's own token, and the assistant's server attaches it to the event it sends the browser.
//
// Only counts and standard errors are kept, never rows or anything the player typed, and only for a short while:
// per answer token, dropped when the answer ends or its token is revoked, after TTL_MS in any case, and capped in
// entries per token and in tokens, oldest first, so it can't grow without limit if an answer dies without ending.

import type { QueryResult } from "./types";

type Evidence = NonNullable<QueryResult["evidence"]>;
type Measures = NonNullable<QueryResult["measures"]>;

export const TTL_MS = 10 * 60_000;
export const MAX_TOKENS = 64;
export const MAX_PER_TOKEN = 64;

const store = new Map<
  string,
  Map<string, { evidence: Evidence; measures: Measures | null; at: number }>
>();

/** A query as canonical JSON, its object keys sorted, so the handler and the assistant's server key it alike. */
export function canonicalQuery(value: unknown): string {
  const sort = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(sort)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, sort((v as Record<string, unknown>)[k])]),
          )
        : v;
  return JSON.stringify(sort(value));
}

function prune(now: number) {
  for (const [token, entries] of store) {
    for (const [key, entry] of entries) if (now - entry.at > TTL_MS) entries.delete(key);
    if (!entries.size) store.delete(token);
  }
}

/**
 * Keeps an answered lookup's evidence under its answer's token: the first measure's, and with several measures each
 * one's (contract.md, "Several measures"). A result without evidence keeps nothing.
 */
export function keepAgentEvidence(
  token: string,
  query: unknown,
  evidence: QueryResult["evidence"],
  now = Date.now(),
  measures: QueryResult["measures"] = undefined,
) {
  if (!evidence) return;
  prune(now);
  let entries = store.get(token);
  if (!entries) {
    if (store.size >= MAX_TOKENS) store.delete(store.keys().next().value!);
    entries = new Map();
    store.set(token, entries);
  }
  const key = canonicalQuery(query);
  entries.delete(key);
  if (entries.size >= MAX_PER_TOKEN) entries.delete(entries.keys().next().value!);
  entries.set(key, { evidence, measures: measures ?? null, at: now });
}

/** The evidence kept for this token and query, or null: expired, dropped, or never seen. */
export function agentEvidence(token: string, query: unknown, now = Date.now()): Evidence | null {
  prune(now);
  return store.get(token)?.get(canonicalQuery(query))?.evidence ?? null;
}

/** Each measure's evidence kept for this token and query, for a lookup of several measures; else null. */
export function agentMeasureEvidence(
  token: string,
  query: unknown,
  now = Date.now(),
): Measures | null {
  prune(now);
  return store.get(token)?.get(canonicalQuery(query))?.measures ?? null;
}

/** Drops everything kept for an answer: when it ends, or its token is revoked. */
export const dropAgentEvidence = (token: string) => void store.delete(token);

/** For tests. */
export const resetAgentEvidenceForTests = () => store.clear();
