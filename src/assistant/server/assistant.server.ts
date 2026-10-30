// Which provider answers (ORBITAL_ASSISTANT_PROVIDER), the limits every question goes through whoever answers,
// and the stream to the browser.

import type { AssistantProvider, ProviderEvent } from "./provider.server.ts";

/** A canned assistant, for tests and for trying the panel without spending anything. Never spawns anything. */
export function fakeAssistant(events: ProviderEvent[] = [{ type: "text", text: "Which quarter would you like to look at?" }]): AssistantProvider {
  return {
    name: "fake",
    async *ask(_prompt, signal) {
      for (const event of events) {
        if (signal.aborted) return;
        if (event.type === "text") {
          for (const word of event.text.split(/(?<= )/)) yield { type: "text", text: word };
        } else yield event;
      }
    },
  };
}

let override: AssistantProvider | null = null;
/** For tests. */
export const setAssistantForTests = (p: AssistantProvider | null) => void (override = p);

/** The provider to use. `real` builds the Claude Code one; it's only called when nothing else answers. */
export function getAssistant(real: () => AssistantProvider, env = process.env): AssistantProvider {
  if (override) return override;
  if (env.ORBITAL_ASSISTANT_PROVIDER === "fake" || env.VITEST) return fakeAssistant();
  return real();
}

/** One answer at a time (each is a process on the Mac), and at most 60 an hour. */
const MAX_PER_HOUR = 60;
const recent: number[] = [];
let busy = false;

export function acquire(now = Date.now()): (() => void) | "busy" | "limit" {
  while (recent.length && now - recent[0] > 3600_000) recent.shift();
  if (busy) return "busy";
  if (recent.length >= MAX_PER_HOUR) return "limit";
  busy = true;
  recent.push(now);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    busy = false;
  };
}
export const resetLimitsForTests = () => {
  recent.length = 0;
  busy = false;
};

/** Newline-delimited JSON: one event per line, flushed as it's produced. Stops the source when the reader goes. */
export function ndjson<T>(events: (signal: AbortSignal) => AsyncIterable<T>, onError: (e: unknown) => T, request?: Request): Response {
  const abort = new AbortController();
  request?.signal.addEventListener("abort", () => abort.abort(), { once: true });
  const encoder = new TextEncoder();
  let iterator: AsyncIterator<T> | undefined;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      iterator ??= events(abort.signal)[Symbol.asyncIterator]();
      try {
        const next = await iterator.next();
        if (next.done) controller.close();
        else controller.enqueue(encoder.encode(`${JSON.stringify(next.value)}\n`));
      } catch (e) {
        controller.enqueue(encoder.encode(`${JSON.stringify(onError(e))}\n`));
        controller.close();
      }
    },
    async cancel() {
      abort.abort();
      await iterator?.return?.();
    },
  });
  return new Response(body, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}
