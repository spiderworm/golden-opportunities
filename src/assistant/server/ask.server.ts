// POST /api/assistant: one question in, the answer out as newline-delimited JSON. Every request is checked at
// the door (method, origin, type, size, shape) before anything is spawned; one answer runs at a time.

import { randomBytes } from "node:crypto";
import type { WireEvent } from "../events.ts";
import { ASSISTANT_NAME } from "../name.ts";
import { chartTitle, lookupPin, type ChartSpec } from "../tools/definitions.ts";
import { acquire, arrive, ndjson } from "./assistant.server.ts";
import { markOffline, offlineCopy, type OfflineReason } from "./availability.server.ts";
import { Refs, scrubDeep, sentenceGate, WITHHELD } from "./figures.server.ts";
import type { BackstoryText } from "../../alma/backstory.ts";
import type { Cap } from "../../platform/usage.server.ts";
import { buildPrompt, LIMITS, questionKind, type Turn } from "./prompt.server.ts";
import {
  AssistantUnavailable,
  type AssistantProvider,
  type ProviderEvent,
} from "./provider.server.ts";

export type ServerTrack = (
  event: string,
  props?: Record<string, string | number | boolean>,
  options?: { hold?: "agent_text" },
) => void;

/** The most of a withheld sentence the held record keeps. */
const WITHHELD_KEPT = 1_000;

export const MAX_BODY = 16_384;

export class Refused extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const refuse = (status: number, message: string) =>
  Response.json({ error: message }, { status, headers: { "cache-control": "no-store" } });

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
  if (
    !local ||
    request.headers.get("origin") !== url.origin ||
    (site !== null && site !== "same-origin")
  )
    throw new Refused(403, "Same-origin requests on this machine only.");
  if (url.search) throw new Refused(400, "No query parameters.");
  const type = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (
    type !== "application/json" ||
    ![null, "identity"].includes(request.headers.get("content-encoding"))
  )
    throw new Refused(415, "Send uncompressed JSON.");
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BODY))
    throw new Refused(413, "Too large.");
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
      timer = setTimeout(
        () => reject(new Refused(408, "The question took too long to arrive.")),
        deadlineMs,
      );
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
  if (typeof body !== "object" || body === null || Array.isArray(body))
    throw new Refused(400, "Send an object.");
  const { question, history = [], pins = false, ...rest } = body as Record<string, unknown>;
  if (Object.keys(rest).length) throw new Refused(400, "Unknown fields.");
  if (typeof question !== "string" || !question.trim() || question.length > LIMITS.question)
    throw new Refused(400, `Ask in 1 to ${LIMITS.question} characters.`);
  if (typeof pins !== "boolean") throw new Refused(400, "Bad pins.");
  if (!Array.isArray(history) || history.length > 20) throw new Refused(400, "Bad history.");
  const turns: Turn[] = [];
  for (const t of history) {
    if (
      typeof t !== "object" ||
      t === null ||
      Object.keys(t).some((k) => k !== "role" && k !== "text")
    )
      throw new Refused(400, "Bad history.");
    const { role, text } = t as Record<string, unknown>;
    if (
      (role !== "player" && role !== "assistant") ||
      typeof text !== "string" ||
      text.length > 10_000
    )
      throw new Refused(400, "Bad history.");
    turns.push({ role, text });
  }
  return { question: question.trim(), history: turns, pins };
}

// What the browser is told when a lookup fails or the assistant stops: fixed strings from this code, never text
// from a tool, the model or the CLI (Audit, #32: a validation error echoed a model-written key). The model
// still reads the tool's own error.
export const LOOKUP_FAILED = "The terminal couldn't run that lookup.";
/** When the answer's query session has ended (Frank's save-bound token: revoked, expired, or the save moved on). */
export const SESSION_ENDED = "That session ended. Reload the page to continue.";
export const UNAVAILABLE = "The assistant is unavailable right now. Try again in a moment.";
export const TIMED_OUT = "The assistant took too long, so it was stopped.";
const OFFLINE_KINDS = new Set(["missing", "signed_out", "broken"]);
export const FAILED = "Something went wrong with the assistant.";

/** A lookup's pin: the input the tool server ran, checked again here; the player pins it from the panel. */
const pinFor = (event: { name: string; input: unknown }) => {
  const pin = lookupPin(event.name, event.input);
  return pin ? { pin } : {};
};

/**
 * Turns a provider's tool events into what the browser shows: the data's own tables and sources. The model's
 * tool input goes only into a lookup's pin, checked as the tool server checked it, and never shown: the pin's
 * title is built from its measure and dimensions. Tool output is ours, but parse it defensively.
 */
export function toWire(event: ProviderEvent, pins = true): WireEvent | null {
  if (event.type === "text") return event;
  // Keyed on the query layer's error code, which the tool server puts first ("SESSION_ENDED: ..."); the rest of
  // the text is never shown.
  if (event.isError)
    return {
      type: "lookup_failed",
      message: event.output.startsWith("SESSION_ENDED:") ? SESSION_ENDED : LOOKUP_FAILED,
    };
  let output: Record<string, unknown>;
  try {
    output = JSON.parse(event.output);
  } catch {
    return null;
  }
  if (
    event.name === "query_data" &&
    Array.isArray(output.columns) &&
    Array.isArray(output.rows) &&
    typeof output.source === "string"
  ) {
    return {
      type: "data",
      columns: output.columns,
      rows: output.rows,
      total: output.total as number | null,
      source: output.source,
      ...pinFor(event),
    } as WireEvent;
  }
  if (
    event.name === "show_chart" &&
    Array.isArray(output.columns) &&
    Array.isArray(output.rows) &&
    typeof output.source === "string"
  ) {
    // The chart is the model's input checked again, and titled from its query: nothing the model wrote is shown.
    const chart = lookupPin(event.name, event.input);
    if (!chart || chart.kind === "comparison") return null;
    return {
      type: "chart",
      chart,
      pin: chart,
      columns: output.columns,
      rows: output.rows,
      total: output.total as number | null,
      source: output.source,
    } as WireEvent;
  }
  if (
    event.name === "compare_data" &&
    Array.isArray(output.columns) &&
    Array.isArray(output.rows) &&
    typeof output.total === "object" &&
    typeof output.source === "string"
  ) {
    return {
      type: "comparison",
      columns: output.columns,
      rows: output.rows,
      total: output.total,
      source: output.source,
      ...pinFor(event),
    } as WireEvent;
  }
  if (
    pins &&
    event.name === "pin_chart" &&
    output.pinned === true &&
    typeof output.source === "string"
  ) {
    return { type: "pin", chart: output.chart as ChartSpec, source: output.source };
  }
  return null;
}

/** Builds the provider for one answer; `pins` says whether it may have the pin tool. */
export type ProviderFor = (options: { pins: boolean }) => AssistantProvider;

/** The game's backstory for this request, checked (src/alma/backstory.ts), or null without a game. */
export type BackstoryFor = (request: Request) => BackstoryText | null;

/** Counts this question against the daily caps (platform/usage.server.ts): null if it may go ahead, else the cap. */
export type UsageFor = (request: Request) => Cap | null;

/** Whether this question comes with a real game (a save that resolves): only then can it reach a model. */
export type GameFor = (request: Request) => boolean;

/** What Dewey says to a question without a game: there's nothing for him to look up yet. */
export const START_A_GAME = "Start a game, then try your question again.";

/** What Dewey says once a daily cap is reached (Plot): in his voice, and the rest of the game goes on. */
export const RESTING =
  "I've looked up all I can for now, and my circuits need a rest. Ask me again later.";

export function ask(
  request: Request,
  providerFor: ProviderFor,
  track: ServerTrack,
  now: () => number = Date.now,
  deadlineMs?: number,
  backstoryFor: BackstoryFor = () => null,
  usageFor: UsageFor = () => null,
  gameFor: GameFor = () => true,
): Promise<Response> {
  return (async () => {
    const refused = (e: unknown) => {
      if (!(e instanceof Refused)) throw e;
      track("assistant_refused", { status: e.status });
      return refuse(e.status, e.message);
    };
    // Every request counts toward the minute cap, before any other check, so floods stay bounded.
    if (!arrive(now())) {
      track("assistant_limited", { reason: "flood" });
      return refuse(429, "Too many requests. Try again in a minute.");
    }
    try {
      checkDoor(request);
    } catch (e) {
      return refused(e);
    }
    // A question without a game asks no model, so it takes no slot and counts toward no limit: it's turned away
    // before admission, unread, so it can't hold the slot with a slow body either (Probe's red-team of #319;
    // Frank's review of #336).
    if (!gameFor(request)) {
      track("assistant_no_game", {});
      return ndjson<WireEvent>(
        async function* () {
          yield { type: "text", text: START_A_GAME };
          yield { type: "done", withheld: 0 };
        },
        () => ({ type: "error", message: FAILED }),
        request,
      );
    }
    // Admit before reading the body, so a slow or oversized body can't hold the server up uncounted. Only a
    // question that passes every check counts toward the hour.
    const slot = acquire(now());
    if (typeof slot === "string") {
      track("assistant_limited", { reason: slot });
      return refuse(
        429,
        slot === "busy"
          ? `${ASSISTANT_NAME} is answering another question.`
          : "That's enough questions for this hour.",
      );
    }
    let input: AskInput;
    try {
      input = await readAsk(request, deadlineMs);
    } catch (e) {
      slot.release();
      return refused(e);
    }
    slot.charge();
    // The daily caps, counted only for a question that passed every check: past one, Dewey rests, and no model is
    // asked. Which cap, never the question, goes in the event.
    const capped = usageFor(request);
    if (capped) {
      slot.release();
      track("assistant_capped", { who: "dewey", cap: capped });
      return ndjson<WireEvent>(
        async function* () {
          yield { type: "text", text: RESTING };
          yield { type: "done", withheld: 0 };
        },
        () => ({ type: "error", message: FAILED }),
        request,
      );
    }
    const provider = providerFor({ pins: input.pins });
    const started = now();
    const stats = {
      lookups: 0,
      failedLookups: 0,
      comparisons: 0,
      charts: 0,
      pins: 0,
      chars: 0,
      withheld: 0,
      figures: 0,
    };
    let outcome = "aborted";
    const nonce = randomBytes(6).toString("hex");
    const backstory = backstoryFor(request);
    const prompt = buildPrompt(
      input.question,
      input.history,
      { pins: input.pins, ...(backstory ? { backstory } : {}) },
      nonce,
    );
    // The withheld note (docs/design/backstory.md, section 6): the backstory's short sentence the first time in a
    // conversation, then the plain line. The history is the browser's, so an edited one changes only which.
    const noted = input.history.some(
      (t) =>
        t.role !== "player" &&
        (t.text.includes(WITHHELD) || (backstory !== null && t.text.includes(backstory.short))),
    );
    const note = backstory && !noted ? backstory.short : WITHHELD;
    // The fence code is no secret worth keeping (it's new for every answer), but nothing has a reason to show
    // it (P4): it's cut from every string sent to the browser.
    const hide = <T>(value: T) => scrubDeep(value, nonce);
    // Figures come only by ref from this answer's successful lookups; a sentence with a figure or direction of
    // the model's own is withheld (figures.server.ts).
    const refs = new Refs();
    // Each withheld sentence is kept on this machine only, held like the player's own text (never sent), so the
    // filter's catches can be read: advice it stopped, or a harmless word it shouldn't have (Probe's Q2 red-team).
    const gate = sentenceGate(
      refs,
      hide,
      (sentence) =>
        track(
          "assistant_sentence_withheld",
          {
            text: sentence.slice(0, WITHHELD_KEPT),
            chars: sentence.length,
            kind: questionKind(input.question),
          },
          { hold: "agent_text" },
        ),
      note,
    );
    let last = "";
    let afterTool = false;
    return ndjson<WireEvent>(
      async function* (signal) {
        try {
          for await (const event of provider.ask(prompt, signal)) {
            if (event.type === "tool") {
              afterTool = true;
              if (!event.isError) {
                try {
                  // A chart's lookup is a query_data lookup to the figures gate: the same refs, cited the same way.
                  refs.addTool(
                    event.name === "show_chart" ? "query_data" : event.name,
                    event.input && typeof event.input === "object"
                      ? ((event.input as { query?: unknown }).query ?? event.input)
                      : event.input,
                    JSON.parse(event.output),
                  );
                } catch {
                  // Not JSON: nothing measured.
                }
              }
            }
            const wire = toWire(event, input.pins);
            if (!wire) continue;
            if (wire.type === "text") {
              // Text before and after a tool call arrives as one run ("...by quarter.I didn't..."): break it.
              const resumed =
                afterTool && last && !/\s$/.test(last) && !/^\s/.test(wire.text) ? "\n\n" : "";
              afterTool = false;
              last = wire.text || last;
              stats.chars += wire.text.length;
              const text = gate.push(resumed + wire.text);
              if (text) yield { type: "text", text };
              continue;
            }
            if (wire.type === "pin") {
              // The model doesn't title pins: the title is always built from the chart's query (Probe X1).
              stats.pins++;
              const chart = { ...wire.chart, title: chartTitle(wire.chart.query) };
              yield hide({ ...wire, chart });
              continue;
            }
            if (wire.type === "data") stats.lookups++;
            if (wire.type === "chart") stats.charts++;
            if (wire.type === "comparison") {
              stats.comparisons++;
              // Its column headings are the values the model compared: shown only where the data had something.
              const ref = (JSON.parse((event as { output: string }).output) as { ref?: unknown })
                .ref;
              const sides = typeof ref === "string" ? refs.compared(ref) : null;
              yield hide({
                ...wire,
                columns: wire.columns.map((c) =>
                  c.key === "from" || c.key === "to"
                    ? { ...c, label: sides?.[c.key] ?? (c.key === "from" ? "First" : "Second") }
                    : c,
                ),
              });
              continue;
            }
            if (wire.type === "lookup_failed") stats.failedLookups++;
            yield hide(wire);
          }
          const rest = gate.flush();
          if (rest) yield { type: "text", text: rest };
          outcome = signal.aborted ? "aborted" : "answered";
          if (!signal.aborted) yield { type: "done", withheld: gate.withheld };
        } catch (e) {
          outcome = e instanceof AssistantUnavailable ? "unavailable" : "failed";
          // Remember it, so the panel says so before the next question (and the event says why).
          if (e instanceof AssistantUnavailable && OFFLINE_KINDS.has(e.kind))
            markOffline(e.kind as OfflineReason, track);
          throw e;
        } finally {
          slot.release();
          stats.withheld = gate.withheld;
          stats.figures = gate.rendered;
          track("assistant_answered", {
            outcome,
            provider: provider.name,
            kind: questionKind(input.question),
            questionChars: input.question.length,
            turns: input.history.length,
            durationMs: now() - started,
            ...stats,
          });
        }
      },
      (e) => ({
        type: "error",
        message:
          e instanceof AssistantUnavailable
            ? OFFLINE_KINDS.has(e.kind)
              ? offlineCopy().message
              : e.kind === "timeout"
                ? TIMED_OUT
                : UNAVAILABLE
            : FAILED,
      }),
      request,
    );
  })();
}
