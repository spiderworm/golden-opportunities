// ORBITAL_ASSISTANT_PROVIDER=fake, as the game runs it: no model, but real lookups. Whatever the question, it
// looks up revenue by quarter and compares the latest two quarters, through the tool server's own code
// (in-process, with this answer's query token) against POST /api/query, so the panel's tables, sources and Pin
// buttons can be tried, and tested end to end, without Claude Code.

import { callTool } from "../tools/server.ts";
import type { AssistantProvider, ProviderEvent } from "./provider.server.ts";

const TEXT = "Here is revenue by quarter, as the data terminal has it, and the latest quarter beside the quarter before it.";

export function fakeLookupAssistant(toolEnv: Record<string, string>): AssistantProvider {
  const lookup = async (name: string, input: Record<string, unknown>): Promise<ProviderEvent & { type: "tool" }> => {
    const { content, isError } = await callTool(name, input, toolEnv);
    return { type: "tool", name, input, output: content[0]?.text ?? "", isError: isError === true };
  };
  return {
    name: "fake",
    async *ask(_prompt, signal) {
      yield { type: "text", text: TEXT };
      const quarters = await lookup("query_data", { measure: "revenue", by: ["quarter"] });
      if (signal.aborted) return;
      yield quarters;
      let labels: string[] = [];
      try {
        labels = (JSON.parse(quarters.output) as { rows: { quarter?: unknown }[] }).rows.map((r) => r.quarter).filter((q): q is string => typeof q === "string");
      } catch {
        // A failed lookup: nothing to compare.
      }
      if (labels.length < 2) return;
      const compared = await lookup("compare_data", { measure: "revenue", across: "quarter", from: labels.at(-2), to: labels.at(-1), by: ["genre"] });
      if (signal.aborted) return;
      yield compared;
    },
  };
}
