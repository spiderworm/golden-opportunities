// The browser side of POST /api/assistant: send a question, read the reply line by line.

import type { WireEvent } from "../events.ts";

export interface SentTurn {
  role: "player" | "assistant";
  text: string;
}

/** Splits a byte stream into parsed lines; a line may arrive in pieces. */
export async function* readLines(body: ReadableStream<Uint8Array>): AsyncGenerator<WireEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) if (line.trim()) yield JSON.parse(line) as WireEvent;
  }
  if (buffer.trim()) yield JSON.parse(buffer) as WireEvent;
}

/** `pins`: whether the page can take pins; without it the assistant isn't offered the pin tool. */
export async function* askAssistant(question: string, history: SentTurn[], pins: boolean, signal: AbortSignal, fetcher: typeof fetch = fetch): AsyncGenerator<WireEvent> {
  const res = await fetcher("/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question, history, pins }), signal });
  if (!res.ok || !res.body) {
    const message = await res
      .json()
      .then((b: { error?: string }) => b.error)
      .catch(() => undefined);
    yield { type: "error", message: message ?? `The assistant didn't answer (${res.status}).` };
    return;
  }
  yield* readLines(res.body);
}
