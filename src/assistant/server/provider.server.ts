// The assistant's model, behind our own interface, so the engine can change (to the API, before release)
// without touching anything else. Nothing outside assistant/server knows which provider answers.
//
// Every provider must give the model nothing but our MCP tools: it reads text typed by players, so it must not
// be able to run anything, read files, browse, or reach any other MCP server.

/** A provider's finished prompt: fixed rules, and one message holding everything the player sent, fenced. */
export interface AssistantPrompt {
  system: string;
  message: string;
}

/** What a provider streams back: text as it's written, and each tool call once its result is in. */
export type ProviderEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string; input: unknown; output: string; isError: boolean };

export interface AssistantProvider {
  /** For logs and analytics only, never shown as part of an answer. */
  readonly name: string;
  /** Streams the answer. Stops, and cleans up, when `signal` aborts. */
  ask(prompt: AssistantPrompt, signal: AbortSignal): AsyncIterable<ProviderEvent>;
}

export class AssistantUnavailable extends Error {}
