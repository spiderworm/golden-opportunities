import Anthropic from "@anthropic-ai/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WireEvent } from "../events.ts";
import { readLines } from "../ui/stream.ts";
import {
  anthropicAssistant,
  apiClient,
  apiTools,
  API_URL,
  DEFAULT_API_MODEL,
  MAX_TURNS,
  type MessagesClient,
  type ToolRunner,
} from "./anthropicApi.server.ts";
import { ask } from "./ask.server.ts";
import { resetLimitsForTests } from "./assistant.server.ts";
import { AssistantUnavailable, type ProviderEvent } from "./provider.server.ts";
import { probeApi } from "./availability.server.ts";

afterEach(resetLimitsForTests);

type Event = Anthropic.Beta.Messages.BetaRawMessageStreamEvent;
type Message = Anthropic.Beta.Messages.BetaMessage;
type Body = Anthropic.Beta.Messages.MessageCreateParamsStreaming;

const textDelta = (text: string) =>
  ({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text } }) as Event;
const final = (stop_reason: string, content: unknown[]) =>
  ({ stop_reason, content }) as unknown as Message;
const toolUse = (id: string, name: string, input: unknown) => ({
  type: "tool_use",
  id,
  name,
  input,
});

/** One model call: its streamed events and its final message, or an error thrown while streaming. */
type Turn = { events?: Event[]; message?: Message; error?: unknown; wait?: boolean };

/** A stand-in for the SDK client: answers each call with the next turn, and records what it was sent. */
function fakeApi(turns: Turn[]) {
  const calls: { body: Body; signal?: AbortSignal }[] = [];
  const client: MessagesClient = {
    beta: {
      messages: {
        stream(body, options) {
          // A copy: the provider keeps appending to its own messages array.
          calls.push({ body: structuredClone(body), signal: options?.signal });
          const turn = turns.shift() ?? { message: final("end_turn", []) };
          return {
            async *[Symbol.asyncIterator]() {
              for (const e of turn.events ?? []) yield e;
              // Until the request is stopped, as the SDK's is: at once if it already was.
              if (turn.wait)
                await new Promise((_, reject) => {
                  const stopped = () => reject(new Anthropic.APIUserAbortError());
                  if (options?.signal?.aborted) stopped();
                  else options?.signal?.addEventListener("abort", stopped);
                });
              if (turn.error) throw turn.error;
            },
            finalMessage: async () => turn.message ?? final("end_turn", []),
          };
        },
      },
    },
  };
  return { client, calls };
}

const TOOL_ENV = {
  ORBITAL_QUERY_TOKEN: "t",
  ORBITAL_QUERY_URL: "http://127.0.0.1:1/api/query",
  ORBITAL_PINS: "1",
};
const PROMPT = { system: "RULES", message: "<<<QUESTION>>> revenue? <<<END>>>" };

async function collect(stream: AsyncIterable<ProviderEvent>): Promise<ProviderEvent[]> {
  const out: ProviderEvent[] = [];
  for await (const e of stream) out.push(e);
  return out;
}
const text = (events: ProviderEvent[]) =>
  events.map((e) => (e.type === "text" ? e.text : "")).join("");

describe("Dewey on the Claude API (David, 3 Nov 2026)", () => {
  it("streams the answer, sending our rules, the fenced message, our tools and nothing else", async () => {
    const { client, calls } = fakeApi([
      { events: [textDelta("Which "), textDelta("quarter?")], message: final("end_turn", []) },
    ]);
    const events = await collect(
      anthropicAssistant({ toolEnv: TOOL_ENV, client }).ask(PROMPT, new AbortController().signal),
    );
    expect(text(events)).toBe("Which quarter?");
    const { body } = calls[0]!;
    expect(body.model).toBe(DEFAULT_API_MODEL);
    expect(body.system).toBe("RULES");
    expect(body.messages).toEqual([{ role: "user", content: PROMPT.message }]);
    expect(body.tools?.map((t) => (t as { name: string }).name)).toEqual([
      "describe_data",
      "query_data",
      "compare_data",
      "show_chart",
      "pin_chart",
    ]);
    // No server tools, no MCP: every tool has our input schema, and none has a server tool's type.
    expect(body.tools?.every((t) => "input_schema" in t && !("type" in t))).toBe(true);
    expect(body).not.toHaveProperty("mcp_servers");
    expect(body.output_config).toEqual({ effort: "medium" });
    expect(body.cache_control).toEqual({ type: "ephemeral" });
    expect(body).toMatchObject({
      fallbacks: "default",
      betas: ["server-side-fallback-2026-07-01"],
    });
  });

  it("leaves out pin_chart where there's nowhere to pin, and offers no tools at all to Alma", () => {
    expect(apiTools({ ...TOOL_ENV, ORBITAL_PINS: "0" }).map((t) => t.name)).not.toContain(
      "pin_chart",
    );
    const { client, calls } = fakeApi([{ message: final("end_turn", []) }]);
    return collect(
      anthropicAssistant({ toolEnv: null, client, model: "claude-haiku-5-5" }).ask(
        PROMPT,
        new AbortController().signal,
      ),
    ).then(() => {
      expect(calls[0]!.body).not.toHaveProperty("tools");
      // The refusal fallback only for the models that take it.
      expect(calls[0]!.body).not.toHaveProperty("fallbacks");
    });
  });

  it("runs each tool call through our tool server's code and sends every result back in one message", async () => {
    const runs: [string, unknown][] = [];
    const runTool: ToolRunner = async (name, input) => {
      runs.push([name, input]);
      return {
        content: [{ type: "text", text: `{"ref":"${name === "query_data" ? "a" : "b"}"}` }],
      };
    };
    const turn1 = final("tool_use", [
      { type: "thinking", thinking: "", signature: "sig" },
      toolUse("t1", "query_data", { measure: "revenue", by: ["quarter"] }),
      toolUse("t2", "show_chart", { query: { measure: "units", by: ["genre"] } }),
    ]);
    const { client, calls } = fakeApi([
      { events: [textDelta("Looking.")], message: turn1 },
      { events: [textDelta(" {{a1}}")], message: final("end_turn", []) },
    ]);
    const events = await collect(
      anthropicAssistant({ toolEnv: TOOL_ENV, client, runTool }).ask(
        PROMPT,
        new AbortController().signal,
      ),
    );
    expect(runs.map(([name]) => name)).toEqual(["query_data", "show_chart"]);
    expect(events.filter((e) => e.type === "tool")).toEqual([
      {
        type: "tool",
        name: "query_data",
        input: { measure: "revenue", by: ["quarter"] },
        output: '{"ref":"a"}',
        isError: false,
      },
      {
        type: "tool",
        name: "show_chart",
        input: { query: { measure: "units", by: ["genre"] } },
        output: '{"ref":"b"}',
        isError: false,
      },
    ]);
    expect(text(events)).toBe("Looking. {{a1}}");
    // The whole assistant turn goes back as it came (its thinking block included), then the results together.
    const second = calls[1]!.body.messages;
    expect(second[1]).toEqual({ role: "assistant", content: turn1.content });
    expect(second[2]).toEqual({
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: "t1", content: '{"ref":"a"}' },
        { type: "tool_result", tool_use_id: "t2", content: '{"ref":"b"}' },
      ],
    });
  });

  it("refuses a tool that isn't ours without running anything, and passes a tool's error on as one", async () => {
    const runs: string[] = [];
    const runTool: ToolRunner = async (name) => {
      runs.push(name);
      return { content: [{ type: "text", text: "Unknown measure." }], isError: true };
    };
    const { client, calls } = fakeApi([
      {
        message: final("tool_use", [
          toolUse("x", "bash", { command: "ls" }),
          toolUse("y", "query_data", { measure: "profit" }),
        ]),
      },
      { message: final("end_turn", []) },
    ]);
    const events = await collect(
      anthropicAssistant({ toolEnv: TOOL_ENV, client, runTool }).ask(
        PROMPT,
        new AbortController().signal,
      ),
    );
    expect(runs).toEqual(["query_data"]);
    expect(
      events.filter((e) => e.type === "tool").map((e) => (e as { isError: boolean }).isError),
    ).toEqual([true, true]);
    expect(calls[1]!.body.messages[2]).toMatchObject({
      content: [
        { tool_use_id: "x", content: "Unknown tool.", is_error: true },
        { tool_use_id: "y", content: "Unknown measure.", is_error: true },
      ],
    });
  });

  it("never runs a tool call cut off at max_tokens, or one in a declined turn", async () => {
    for (const stop of ["max_tokens", "refusal"]) {
      const runs: string[] = [];
      const { client, calls } = fakeApi([
        // Something said first: a refusal with nothing said is the next test's.
        {
          events: [textDelta("Let me see. ")],
          message: final(stop, [toolUse("t", "query_data", { measure: "rev" })]),
        },
      ]);
      await collect(
        anthropicAssistant({
          toolEnv: TOOL_ENV,
          client,
          runTool: async (n) => (runs.push(n), { content: [] }),
        }).ask(PROMPT, new AbortController().signal),
      );
      expect(runs, stop).toEqual([]);
      expect(calls, stop).toHaveLength(1);
    }
  });

  it("says it couldn't answer when a refusal the fallback didn't rescue leaves nothing said (Frank, #313)", async () => {
    const { client } = fakeApi([{ message: final("refusal", []) }]);
    const thrown = await collect(
      anthropicAssistant({ toolEnv: TOOL_ENV, client }).ask(PROMPT, new AbortController().signal),
    ).catch((e: unknown) => e);
    expect(thrown).toMatchObject({ kind: "other" });
  });

  it(`stops after ${MAX_TURNS} model calls`, async () => {
    const loop = Array.from({ length: MAX_TURNS + 2 }, (_, i) => ({
      message: final("tool_use", [toolUse(`t${i}`, "describe_data", {})]),
    }));
    const { client, calls } = fakeApi(loop);
    const answer = collect(
      anthropicAssistant({
        toolEnv: TOOL_ENV,
        client,
        runTool: async () => ({ content: [{ type: "text", text: "{}" }] }),
      }).ask(PROMPT, new AbortController().signal),
    );
    await expect(answer).rejects.toMatchObject({ kind: "other" });
    expect(calls).toHaveLength(MAX_TURNS);
  });

  it("tells the player the right thing for a refused key, a rate limit, an overload, a timeout, or anything else, never in the API's words", async () => {
    const secret = "request req_secret with sk-ant-api03-abc";
    const cases: [unknown, string][] = [
      [
        Anthropic.APIError.generate(401, { error: { message: secret } }, secret, new Headers()),
        "signed_out",
      ],
      [
        Anthropic.APIError.generate(403, { error: { message: secret } }, secret, new Headers()),
        "signed_out",
      ],
      [
        Anthropic.APIError.generate(429, { error: { message: secret } }, secret, new Headers()),
        "rate_limited",
      ],
      [
        Anthropic.APIError.generate(529, { error: { message: secret } }, secret, new Headers()),
        "overloaded",
      ],
      [new Anthropic.APIConnectionTimeoutError({ message: secret }), "timeout"],
      [
        Anthropic.APIError.generate(500, { error: { message: secret } }, secret, new Headers()),
        "other",
      ],
      [new Error(secret), "other"],
    ];
    for (const [error, kind] of cases) {
      const { client } = fakeApi([{ error }]);
      const thrown = await collect(
        anthropicAssistant({ toolEnv: TOOL_ENV, client }).ask(PROMPT, new AbortController().signal),
      ).catch((e: unknown) => e);
      expect(thrown, kind).toBeInstanceOf(AssistantUnavailable);
      expect((thrown as AssistantUnavailable).kind, kind).toBe(kind);
      expect((thrown as Error).message).not.toMatch(/secret|sk-ant/);
    }
  });

  it("says there's no key, without calling anything, when ANTHROPIC_API_KEY is unset", async () => {
    expect(apiClient({})).toBeNull();
    expect(apiClient({ ANTHROPIC_API_KEY: "  " })).toBeNull();
    expect(apiClient({ ANTHROPIC_API_KEY: "sk-ant-test" })).not.toBeNull();
    // The address is fixed: ANTHROPIC_BASE_URL can't send the key elsewhere (Frank, #313).
    vi.stubEnv("ANTHROPIC_BASE_URL", "https://collector.example");
    try {
      expect(
        (apiClient({ ANTHROPIC_API_KEY: "sk-ant-test" }) as unknown as { baseURL: string }).baseURL,
      ).toBe(API_URL);
    } finally {
      vi.unstubAllEnvs();
    }
    const thrown = await collect(
      anthropicAssistant({ toolEnv: TOOL_ENV, client: null }).ask(
        PROMPT,
        new AbortController().signal,
      ),
    ).catch((e: unknown) => e);
    expect(thrown).toMatchObject({ kind: "missing" });
    expect(await probeApi({ env: {} })).toEqual({ state: "offline", reason: "missing" });
    expect(await probeApi({ env: { ANTHROPIC_API_KEY: "sk-ant-test" } })).toEqual({
      state: "ready",
    });
  });

  it("stops the request in flight when the player stops, quietly", async () => {
    const stop = new AbortController();
    // Text is shown up to its last space (a word could be the start of an email address), so this ends in one.
    const { client, calls } = fakeApi([{ events: [textDelta("Looking it up ")], wait: true }]);
    const events: ProviderEvent[] = [];
    for await (const e of anthropicAssistant({ toolEnv: TOOL_ENV, client }).ask(
      PROMPT,
      stop.signal,
    )) {
      events.push(e);
      stop.abort();
    }
    expect(text(events)).toBe("Looking it up ");
    expect(calls[0]!.signal?.aborted).toBe(true);
  });

  it("stops a request that runs past the timeout, and says it timed out", async () => {
    const { client, calls } = fakeApi([{ wait: true }]);
    const thrown = await collect(
      anthropicAssistant({ toolEnv: TOOL_ENV, client, timeoutMs: 20 }).ask(
        PROMPT,
        new AbortController().signal,
      ),
    ).catch((e: unknown) => e);
    expect(thrown).toMatchObject({ kind: "timeout" });
    expect(calls[0]!.signal?.aborted).toBe(true);
  });

  it("cuts every email address from the text and from tool calls", async () => {
    const { client } = fakeApi([
      {
        events: [textDelta("Write to dewey@exa"), textDelta("mple.com today.")],
        message: final("tool_use", [toolUse("t", "query_data", { note: "a@b.co" })]),
      },
      { message: final("end_turn", []) },
    ]);
    const events = await collect(
      anthropicAssistant({
        toolEnv: TOOL_ENV,
        client,
        runTool: async () => ({ content: [{ type: "text", text: "owner c@d.io" }] }),
      }).ask(PROMPT, new AbortController().signal),
    );
    expect(JSON.stringify(events)).not.toMatch(/@/);
  });

  it("answers through the same gate as Claude Code: a figure cited by ref is filled in, and the lookup shown", async () => {
    const output = JSON.stringify({
      ref: "a",
      columns: [
        { key: "quarter", label: "Quarter", type: "string", nullable: false },
        { key: "units", label: "Units sold", type: "number", nullable: false },
      ],
      rows: [{ ref: "a1", quarter: "2193-Q1", units: 120 }],
      total: 120,
      source: "Units from the ledger.",
      complete: true,
    });
    const { client } = fakeApi([
      {
        message: final("tool_use", [
          toolUse("t", "query_data", { measure: "units", by: ["quarter"] }),
        ]),
      },
      {
        events: [textDelta("I looked up units in {{a1.quarter}}: {{a1}}.")],
        message: final("end_turn", []),
      },
    ]);
    const provider = anthropicAssistant({
      toolEnv: TOOL_ENV,
      client,
      runTool: async () => ({ content: [{ type: "text", text: output }] }),
    });
    const res = await ask(
      new Request("http://127.0.0.1:5173/api/assistant", {
        method: "POST",
        headers: { origin: "http://127.0.0.1:5173", "content-type": "application/json" },
        body: JSON.stringify({ question: "Units by quarter?" }),
      }),
      () => provider,
      () => {},
    );
    const wire: WireEvent[] = [];
    for await (const e of readLines(res.body!)) wire.push(e as WireEvent);
    const said = wire.map((e) => (e.type === "text" ? e.text : "")).join("");
    expect(said).toContain("120");
    expect(said).not.toContain("{{");
    expect(wire.some((e) => e.type === "data")).toBe(true);
    expect(wire.at(-1)).toMatchObject({ type: "done" });
  });
});
