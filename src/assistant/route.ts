// POST /api/assistant. Wires the real pieces together; the work is in server/ask.server.ts.

import { SaveError } from "~/game/store.server";
import { trackServer } from "~/platform/analytics/analytics.server";
import { getAssistant } from "./server/assistant.server.ts";
import { ask, type ServerTrack } from "./server/ask.server.ts";
import { claudeCodeAssistant } from "./server/claudeCode.server.ts";
import { queryToken } from "./server/queryToken.server.ts";
import type { AssistantProvider } from "./server/provider.server.ts";
import { orbitalToolServer } from "./tools/toolServer.server.ts";
import type { Route } from "./+types/route";

// Content-free events only: what the player typed is recorded in the browser, held on the device.
const track: ServerTrack = (event, props) => trackServer(event, props);

const unavailable = (message: string): AssistantProvider => ({
  name: "unavailable",
  async *ask() {
    yield { type: "text", text: message };
  },
});

function provider(request: Request, { pins }: { pins: boolean }): AssistantProvider {
  return getAssistant(() => {
    try {
      const capability = queryToken(request);
      try {
        const real = claudeCodeAssistant({ server: orbitalToolServer(capability.token, { pins }) });
        return { name: real.name, async *ask(prompt, signal) {
          try { yield* real.ask(prompt, signal); } finally { capability.revoke(); }
        } };
      } catch (error) { capability.revoke(); throw error; }
    } catch (e) {
      return unavailable(e instanceof SaveError && e.code === "MISSING_SAVE"
        ? "Start a game, then try your question again."
        : "The assistant is unavailable right now. Try again in a moment.");
    }
  });
}

export const action = ({ request }: Route.ActionArgs) => ask(request, options => provider(request, options), track);

export const loader = () => Response.json({ error: "Use POST." }, { status: 405, headers: { allow: "POST", "cache-control": "no-store" } });
