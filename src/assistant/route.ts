// POST /api/assistant. Wires the real pieces together; the work is in server/ask.server.ts.

import { getAssistant } from "./server/assistant.server.ts";
import { ask, type ServerTrack } from "./server/ask.server.ts";
import { claudeCodeAssistant } from "./server/claudeCode.server.ts";
import { queryToken } from "./server/queryToken.server.ts";
import type { AssistantProvider } from "./server/provider.server.ts";
import { orbitalToolServer } from "./tools/toolServer.server.ts";
import type { Route } from "./+types/route";

/** Replaced by the platform's server track() when it lands (PR #9). Content-free events only. */
let track: ServerTrack = () => {};
export const setAssistantTrack = (t: ServerTrack) => void (track = t);

const unavailable = (message: string): AssistantProvider => ({
  name: "unavailable",
  async *ask() {
    yield { type: "text", text: message };
  },
});

function provider(): AssistantProvider {
  return getAssistant(() => {
    try {
      return claudeCodeAssistant({ server: orbitalToolServer(queryToken()) });
    } catch (e) {
      return unavailable(e instanceof Error ? e.message : "The assistant is unavailable.");
    }
  });
}

export const action = ({ request }: Route.ActionArgs) => ask(request, provider(), track);

export const loader = () => Response.json({ error: "Use POST." }, { status: 405, headers: { allow: "POST", "cache-control": "no-store" } });
