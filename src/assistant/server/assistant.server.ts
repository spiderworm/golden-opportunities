// Which provider answers (ORBITAL_ASSISTANT_PROVIDER), the limits every question goes through whoever answers,
// and the stream to the browser.

import type { AssistantProvider, ProviderEvent } from "./provider.server.ts";

/** A canned assistant, for tests and for trying the panel without spending anything. Never spawns anything. */
export function fakeAssistant(
  events: ProviderEvent[] = [{ type: "text", text: "Which quarter would you like to look at?" }],
): AssistantProvider {
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

/**
 * The provider to use. `real` builds the Claude Code one; it's only called when nothing else answers. `fake`
 * builds the one ORBITAL_ASSISTANT_PROVIDER=fake asks for (tests under Vitest always get the canned one).
 */
export function getAssistant(
  real: () => AssistantProvider,
  env = process.env,
  fake: () => AssistantProvider = fakeAssistant,
): AssistantProvider {
  if (override) return override;
  if (env.VITEST) return fakeAssistant();
  if (env.ORBITAL_ASSISTANT_PROVIDER === "fake") return fake();
  return real();
}

/**
 * One answer at a time (each is a process on the Mac), and at most 60 answers an hour. Only a question that
 * passed every check counts toward the hour, so malformed requests can't lock the player out (Probe's red
 * team, P3); every request, before any other check, counts toward a cheap per-minute cap, so floods stay
 * bounded and end within a minute.
 */
const MAX_PER_HOUR = 60;
const MAX_PER_MINUTE = 30;
/** Questions without a game have a minute cap of their own, so a loop of them can't fill the one players share. */
const MAX_WITHOUT_GAME_PER_MINUTE = 30;
const answered: number[] = [];
const arrived: number[] = [];
const arrivedWithoutGame: number[] = [];
let busy = false;

export interface Slot {
  /** Counts this answer toward the hour, once its question has passed every check. */
  charge(): void;
  release(): void;
}

/** Counts a request toward the minute cap; false once it's reached. Called for every request, first. */
export function arrive(now = Date.now()): boolean {
  return within(arrived, MAX_PER_MINUTE, now);
}

/**
 * Counts a question without a game toward its own minute cap, never the shared one (Audit's review of #338): a
 * cheap loop of them, with no save cookie, would otherwise keep every player's questions refused while it ran.
 */
export function arriveWithoutGame(now = Date.now()): boolean {
  return within(arrivedWithoutGame, MAX_WITHOUT_GAME_PER_MINUTE, now);
}

function within(times: number[], max: number, now: number): boolean {
  while (times.length && now - times[0]! > 60_000) times.shift();
  if (times.length >= max) return false;
  times.push(now);
  return true;
}

export function acquire(now = Date.now()): Slot | "busy" | "limit" {
  while (answered.length && now - answered[0] > 3600_000) answered.shift();
  if (busy) return "busy";
  if (answered.length >= MAX_PER_HOUR) return "limit";
  busy = true;
  let charged = false;
  let released = false;
  return {
    charge() {
      if (charged || released) return;
      charged = true;
      answered.push(now);
    },
    release() {
      if (released) return;
      released = true;
      busy = false;
    },
  };
}
export const resetLimitsForTests = () => {
  answered.length = 0;
  arrived.length = 0;
  arrivedWithoutGame.length = 0;
  busy = false;
};

/** Newline-delimited JSON: one event per line, flushed as it's produced. Stops the source when the reader goes. */
export function ndjson<T>(
  events: (signal: AbortSignal) => AsyncIterable<T>,
  onError: (e: unknown) => T,
  request?: Request,
): Response {
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
  return new Response(body, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
