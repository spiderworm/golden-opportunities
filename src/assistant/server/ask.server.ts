// POST /api/assistant: one question in, the answer out as newline-delimited JSON. Every request is checked at
// the door (method, origin, type, size, shape) before anything is spawned; one answer runs at a time.

import type { WireEvent } from "../events.ts";
import { ASSISTANT_NAME } from "../name.ts";
import type { ChartSpec } from "../tools/definitions.ts";
import { acquire, ndjson } from "./assistant.server.ts";
import { buildPrompt, LIMITS, questionKind, type Turn } from "./prompt.server.ts";
import { AssistantUnavailable, type AssistantProvider, type ProviderEvent } from "./provider.server.ts";

export type ServerTrack = (event: string, props?: Record<string, string | number | boolean>) => void;

export const MAX_BODY = 16_384;

export class Refused extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const refuse = (status: number, message: string) => Response.json({ error: message }, { status, headers: { "cache-control": "no-store" } });

export interface AskInput {
  question: string;
  history: Turn[];
  /** Whether the page has somewhere to put pins; without it, the assistant isn't given the pin tool. */
  pins: boolean;
}

/**
 * The checks that need only the headers, before the request is admitted: method, a same-origin browser
 * request on this machine (the boundary of Frank's authorizeQuery in src/query/access.server.ts, which rejects
 * arbitrary Host/Origin pairs, so DNS rebinding can't reach it), type and declared size. Throws Refused.
 */
export function checkDoor(request: Request) {
  if (request.method !== "POST") throw new Refused(405, "Use POST.");
  const url = new URL(request.url);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const site = request.headers.get("sec-fetch-site");
  if (!local || request.headers.get("origin") !== url.origin || (site !== null && site !== "same-origin")) throw new Refused(403, "Same-origin requests on this machine only.");
  if (url.search) throw new Refused(400, "No query parameters.");
  const type = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (type !== "application/json" || ![null, "identity"].includes(request.headers.get("content-encoding"))) throw new Refused(415, "Send uncompressed JSON.");
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BODY)) throw new Refused(413, "Too large.");
}

/** Reads the body with a byte cap and a deadline, as Frank's /api/query does, then checks its shape. Throws Refused. */
export async function readAsk(request: Request, deadlineMs = 5_000): Promise<AskInput> {
  if (!request.body) throw new Refused(400, "Send a question.");
  const reader = request.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let raw: string;
  try {
    const read = async () => {
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BODY) throw new Refused(413, "Too large.");
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      try {
        return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        throw new Refused(400, "Not UTF-8.");
      }
    };
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Refused(408, "The question took too long to arrive.")), deadlineMs);
    });
    raw = await Promise.race([read(), deadline]);
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new Refused(400, "Not JSON.");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw new Refused(400, "Send an object.");
  const { question, history = [], pins = false, ...rest } = body as Record<string, unknown>;
  if (Object.keys(rest).length) throw new Refused(400, "Unknown fields.");
  if (typeof question !== "string" || !question.trim() || question.length > LIMITS.question) throw new Refused(400, `Ask in 1 to ${LIMITS.question} characters.`);
  if (typeof pins !== "boolean") throw new Refused(400, "Bad pins.");
  if (!Array.isArray(history) || history.length > 20) throw new Refused(400, "Bad history.");
  const turns: Turn[] = [];
  for (const t of history) {
    if (typeof t !== "object" || t === null || Object.keys(t).some((k) => k !== "role" && k !== "text" && k !== "stored")) throw new Refused(400, "Bad history.");
    const { role, text, stored } = t as Record<string, unknown>;
    if ((role !== "player" && role !== "assistant") || typeof text !== "string" || text.length > 10_000 || (stored !== undefined && stored !== true)) throw new Refused(400, "Bad history.");
    turns.push(stored ? { role, text, stored } : { role, text });
  }
  return { question: question.trim(), history: turns, pins };
}

/** Turns a provider's tool events into what the browser shows. Tool output is ours, but parse it defensively. */
export function toWire(event: ProviderEvent, pins = true): WireEvent | null {
  if (event.type === "text") return event;
  if (event.isError) return { type: "lookup_failed", message: event.output.slice(0, 300) };
  let output: Record<string, unknown>;
  try {
    output = JSON.parse(event.output);
  } catch {
    return null;
  }
  if (event.name === "query_data" && Array.isArray(output.columns) && Array.isArray(output.rows) && typeof output.source === "string") {
    return { type: "data", query: event.input, columns: output.columns, rows: output.rows, total: output.total as number | null, source: output.source } as WireEvent;
  }
  if (pins && event.name === "pin_chart" && output.pinned === true && typeof output.source === "string") {
    return { type: "pin", chart: output.chart as ChartSpec, source: output.source };
  }
  return null;
}

/** Builds the provider for one answer; `pins` says whether it may have the pin tool. */
export type ProviderFor = (options: { pins: boolean }) => AssistantProvider;

export function ask(request: Request, providerFor: ProviderFor, track: ServerTrack, now: () => number = Date.now, deadlineMs?: number): Promise<Response> {
  return (async () => {
    const refused = (e: unknown) => {
      if (!(e instanceof Refused)) throw e;
      track("assistant_refused", { status: e.status });
      return refuse(e.status, e.message);
    };
    try {
      checkDoor(request);
    } catch (e) {
      return refused(e);
    }
    // Admit before reading the body, so a slow or oversized body can't hold the server up uncounted.
    const release = acquire(now());
    if (release === "busy" || release === "limit") {
      track("assistant_limited", { reason: release });
      return refuse(429, release === "busy" ? `${ASSISTANT_NAME} is answering another question.` : "That's enough questions for this hour.");
    }
    let input: AskInput;
    try {
      input = await readAsk(request, deadlineMs);
    } catch (e) {
      release();
      return refused(e);
    }
    const provider = providerFor({ pins: input.pins });
    const started = now();
    const stats = { lookups: 0, failedLookups: 0, pins: 0, chars: 0 };
    let outcome = "aborted";
    const prompt = buildPrompt(input.question, input.history, { pins: input.pins });
    return ndjson<WireEvent>(
      async function* (signal) {
        try {
          for await (const event of provider.ask(prompt, signal)) {
            const wire = toWire(event, input.pins);
            if (!wire) continue;
            if (wire.type === "text") stats.chars += wire.text.length;
            if (wire.type === "data") stats.lookups++;
            if (wire.type === "lookup_failed") stats.failedLookups++;
            if (wire.type === "pin") stats.pins++;
            yield wire;
          }
          outcome = signal.aborted ? "aborted" : "answered";
          if (!signal.aborted) yield { type: "done" };
        } catch (e) {
          outcome = e instanceof AssistantUnavailable ? "unavailable" : "failed";
          throw e;
        } finally {
          release();
          track("assistant_answered", { outcome, provider: provider.name, kind: questionKind(input.question), questionChars: input.question.length, turns: input.history.length, durationMs: now() - started, ...stats });
        }
      },
      (e) => ({ type: "error", message: e instanceof AssistantUnavailable ? e.message : "Something went wrong with the assistant." }),
      request,
    );
  })();
}
