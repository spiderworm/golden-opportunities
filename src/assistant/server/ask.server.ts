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

/** The request body, checked. Throws Refused. */
export async function readAsk(request: Request): Promise<{ question: string; history: Turn[] }> {
  if (request.method !== "POST") throw new Refused(405, "Use POST.");
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) throw new Refused(403, "Same-origin requests only.");
  if (!(request.headers.get("content-type") ?? "").startsWith("application/json")) throw new Refused(415, "Send JSON.");
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) throw new Refused(413, "Too large.");
  const raw = await request.text();
  if (raw.length > MAX_BODY) throw new Refused(413, "Too large.");
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new Refused(400, "Not JSON.");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw new Refused(400, "Send an object.");
  const { question, history = [], ...rest } = body as Record<string, unknown>;
  if (Object.keys(rest).length) throw new Refused(400, "Unknown fields.");
  if (typeof question !== "string" || !question.trim() || question.length > LIMITS.question) throw new Refused(400, `Ask in 1 to ${LIMITS.question} characters.`);
  if (!Array.isArray(history) || history.length > 20) throw new Refused(400, "Bad history.");
  const turns: Turn[] = [];
  for (const t of history) {
    if (typeof t !== "object" || t === null || Object.keys(t).some((k) => k !== "role" && k !== "text")) throw new Refused(400, "Bad history.");
    const { role, text } = t as Record<string, unknown>;
    if ((role !== "player" && role !== "assistant") || typeof text !== "string" || text.length > 10_000) throw new Refused(400, "Bad history.");
    turns.push({ role, text });
  }
  return { question: question.trim(), history: turns };
}

/** Turns a provider's tool events into what the browser shows. Tool output is ours, but parse it defensively. */
export function toWire(event: ProviderEvent): WireEvent | null {
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
  if (event.name === "pin_chart" && output.pinned === true && typeof output.source === "string") {
    return { type: "pin", chart: output.chart as ChartSpec, source: output.source };
  }
  return null;
}

export function ask(request: Request, provider: AssistantProvider, track: ServerTrack, now: () => number = Date.now): Promise<Response> {
  return (async () => {
    let input: { question: string; history: Turn[] };
    try {
      input = await readAsk(request);
    } catch (e) {
      if (e instanceof Refused) {
        track("assistant_refused", { status: e.status });
        return refuse(e.status, e.message);
      }
      throw e;
    }
    const release = acquire(now());
    if (release === "busy" || release === "limit") {
      track("assistant_limited", { reason: release });
      return refuse(429, release === "busy" ? `${ASSISTANT_NAME} is answering another question.` : "That's enough questions for this hour.");
    }
    const started = now();
    const stats = { lookups: 0, failedLookups: 0, pins: 0, chars: 0 };
    let outcome = "aborted";
    const prompt = buildPrompt(input.question, input.history);
    return ndjson<WireEvent>(
      async function* (signal) {
        try {
          for await (const event of provider.ask(prompt, signal)) {
            const wire = toWire(event);
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
