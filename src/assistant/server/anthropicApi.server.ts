// The assistant on the Claude API (ORBITAL_ASSISTANT_PROVIDER=anthropic; David, 3 Nov 2026): the Messages API with
// streaming and our own tools, behind the same AssistantProvider as Claude Code, so the figures gate, redaction and
// analytics are unchanged. Alma (src/alma) runs on it with no tools at all.
//
// The locks, each checked by a test:
// - The model gets our tools (TOOLS, from tools/definitions.ts) and nothing else: no server tools, no MCP. Each
//   call runs in this process through the tool server's own code (callTool), with this answer's query token, so
//   a lookup is checked and limited exactly as under Claude Code.
// - The key comes only from ANTHROPIC_API_KEY, passed to the client explicitly, which turns off every other way
//   the SDK finds credentials (profiles on disk, among them): nothing is read from the home folder (David's
//   rule). It's never logged, never in an error message and never sent anywhere but the API.
// - At most MAX_TURNS model calls an answer, a timeout over the whole answer, and the caller's signal stops the
//   request in flight.
// - Every email address is cut from what comes back, as from Claude Code's.

import Anthropic from "@anthropic-ai/sdk";
import { TOOLS } from "../tools/definitions.ts";
import { callTool } from "../tools/server.ts";
import {
  AssistantUnavailable,
  type AssistantPrompt,
  type AssistantProvider,
  type ProviderEvent,
} from "./provider.server.ts";
import { emailRedactor, redactDeep, redactEmails } from "./redact.server.ts";

/** Dewey's and Alma's model unless ORBITAL_ANTHROPIC_MODEL says otherwise (David, via Goldy). */
export const DEFAULT_API_MODEL = "claude-sonnet-5-5";
/** Model calls in one answer: a lookup or two, a chart, and the reply, with room to correct a refused query. */
export const MAX_TURNS = 8;
/** The answer's output budget per call: replies are short, and thinking counts against it. */
const MAX_TOKENS = 16_000;
/** The Claude API, and only it, gets the key. */
export const API_URL = "https://api.anthropic.com";
/** Models the server-side refusal fallback (`fallbacks: "default"`) accepts. */
const FALLBACK_MODELS = new Set([
  "claude-sonnet-5-5",
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-fable-5-1",
]);

/** The parts of the SDK client this provider uses, so tests can stand in for the API. */
export interface MessagesClient {
  beta: {
    messages: {
      stream(
        body: Anthropic.Beta.Messages.MessageCreateParamsStreaming,
        options?: { signal?: AbortSignal },
      ): AsyncIterable<Anthropic.Beta.Messages.BetaRawMessageStreamEvent> & {
        finalMessage(): Promise<Anthropic.Beta.Messages.BetaMessage>;
      };
    };
  };
}

/** Runs one of our tools: the tool server's callTool, in process. */
export type ToolRunner = (
  name: string,
  input: unknown,
  env: Record<string, string>,
) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }>;

/** The API's tool definitions: ours, without pin_chart on a page with nowhere to pin (as the tool server lists them). */
export function apiTools(toolEnv: Record<string, string>): Anthropic.Beta.Messages.BetaTool[] {
  return TOOLS.filter((t) => toolEnv.ORBITAL_PINS !== "0" || t.name !== "pin_chart").map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema as Anthropic.Beta.Messages.BetaTool.InputSchema,
  }));
}

/** The client, from ANTHROPIC_API_KEY alone; null without one. */
export function apiClient(env: NodeJS.ProcessEnv = process.env): MessagesClient | null {
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  // The address is fixed too, so ANTHROPIC_BASE_URL in the environment can't send the key elsewhere (Frank, #313).
  return apiKey ? (new Anthropic({ apiKey, baseURL: API_URL }) as unknown as MessagesClient) : null;
}

/** What the player is told, by kind: the API's own message is never passed on (it could carry request detail). */
function unavailable(error: unknown): AssistantUnavailable {
  if (
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError
  )
    return new AssistantUnavailable("The API key was refused.", "signed_out");
  if (error instanceof Anthropic.RateLimitError)
    return new AssistantUnavailable("The API is rate limiting this key.", "rate_limited");
  if (error instanceof Anthropic.APIConnectionTimeoutError)
    return new AssistantUnavailable("The API took too long to answer.", "timeout");
  if (error instanceof Anthropic.APIError && error.status === 529)
    return new AssistantUnavailable("The API is overloaded.", "overloaded");
  if (error instanceof AssistantUnavailable) return error;
  return new AssistantUnavailable("The API couldn't answer.", "other");
}

export function anthropicAssistant({
  toolEnv,
  model = process.env.ORBITAL_ANTHROPIC_MODEL || DEFAULT_API_MODEL,
  timeoutMs = 120_000,
  client = apiClient(),
  runTool = callTool,
}: {
  /** The tool server's environment (query token, URL, pins); null for no tools at all (Alma). */
  toolEnv: Record<string, string> | null;
  model?: string;
  timeoutMs?: number;
  client?: MessagesClient | null;
  runTool?: ToolRunner;
}): AssistantProvider {
  const tools = toolEnv ? apiTools(toolEnv) : [];
  return {
    name: `api:${model}`.slice(0, 60),
    async *ask(prompt: AssistantPrompt, signal: AbortSignal): AsyncIterable<ProviderEvent> {
      if (!client)
        throw new AssistantUnavailable("No API key is set (ANTHROPIC_API_KEY).", "missing");
      // One signal for the caller's stop and the timeout, so either ends the request in flight.
      const stop = new AbortController();
      const onAbort = () => stop.abort();
      signal.addEventListener("abort", onAbort, { once: true });
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        stop.abort();
      }, timeoutMs);
      const redactor = emailRedactor();
      /** Whether the model has written anything yet, in this answer. */
      let said = false;
      const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [
        { role: "user", content: prompt.message },
      ];
      try {
        for (let turn = 1; ; turn++) {
          if (turn > MAX_TURNS)
            throw new AssistantUnavailable(
              `The answer took more than ${MAX_TURNS} steps.`,
              "other",
            );
          const stream = client.beta.messages.stream(
            {
              model,
              max_tokens: MAX_TOKENS,
              system: prompt.system,
              messages,
              ...(tools.length ? { tools } : {}),
              // Medium: a few lookups and a short reply; thinking stays adaptive (the model's default).
              output_config: { effort: "medium" },
              // The rules and tools are the same on every call of the loop: cached, they cost a tenth (Frank, #313).
              cache_control: { type: "ephemeral" },
              // A declined request is re-run on a model the API chooses, inside the same call.
              ...(FALLBACK_MODELS.has(model)
                ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
                : {}),
              stream: true,
            },
            { signal: stop.signal },
          );
          let message: Anthropic.Beta.Messages.BetaMessage;
          try {
            for await (const event of stream) {
              if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
                said ||= event.delta.text.trim() !== "";
                const text = redactor.push(event.delta.text);
                if (text) yield { type: "text", text };
              }
            }
            message = await stream.finalMessage();
          } catch (error) {
            if (signal.aborted) return;
            if (timedOut)
              throw new AssistantUnavailable(
                `The assistant took longer than ${timeoutMs / 1000} seconds, so it was stopped.`,
                "timeout",
              );
            throw unavailable(error);
          }
          const calls = message.content.filter(
            (b): b is Anthropic.Beta.Messages.BetaToolUseBlock => b.type === "tool_use",
          );
          // Done, declined, or cut off: a tool call cut off at max_tokens can hold a truncated input, so it's
          // never run. Anything else without a call ends the answer too.
          // A refusal the fallback didn't rescue, with nothing said yet: say it couldn't answer, not nothing at all.
          if (message.stop_reason === "refusal" && !said)
            throw new AssistantUnavailable("The model declined to answer.", "other");
          if (message.stop_reason !== "tool_use" || calls.length === 0) break;
          const flushed = redactor.flush();
          if (flushed) yield { type: "text", text: flushed };
          // The whole turn goes back as it came: thinking and fallback blocks included, as the API requires.
          messages.push({ role: "assistant", content: message.content });
          const results: Anthropic.Beta.Messages.BetaToolResultBlockParam[] = [];
          for (const call of calls) {
            if (signal.aborted) return;
            const known = tools.some((t) => t.name === call.name);
            const { content, isError } = known
              ? await runTool(call.name, call.input, toolEnv!)
              : { content: [{ type: "text", text: "Unknown tool." }], isError: true };
            const output = content[0]?.text ?? "";
            yield {
              type: "tool",
              name: call.name,
              input: redactDeep(call.input),
              output: redactEmails(output),
              isError: isError === true,
            };
            results.push({
              type: "tool_result",
              tool_use_id: call.id,
              content: output,
              ...(isError ? { is_error: true } : {}),
            });
          }
          // Every result in one message, so the model keeps calling tools in parallel when it can.
          messages.push({ role: "user", content: results });
        }
        const rest = redactor.flush();
        if (rest) yield { type: "text", text: rest };
      } finally {
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
        stop.abort();
      }
    },
  };
}
