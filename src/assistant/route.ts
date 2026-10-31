// POST /api/assistant asks; GET says whether the assistant can answer on this machine. Wires the real pieces
// together; the work is in server/ask.server.ts and server/availability.server.ts.

import { SaveError } from "~/game/store.server";
import { trackServer } from "~/platform/analytics/analytics.server";
import { getAssistant } from "./server/assistant.server.ts";
import { ask, type ServerTrack } from "./server/ask.server.ts";
import { assistantAvailability, OFFLINE, OFFLINE_HINT } from "./server/availability.server.ts";
import { claudeCodeAssistant } from "./server/claudeCode.server.ts";
import { queryToken } from "./server/queryToken.server.ts";
import { AssistantUnavailable, type AssistantProvider } from "./server/provider.server.ts";
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
          try {
            // Known offline (no Claude Code, signed out, failing to start): say so without spawning anything.
            const availability = await assistantAvailability({ track });
            // Cancelled while the probe ran: stop here rather than spawn for no one (Audit, #67).
            if (signal.aborted) return;
            if (availability.state === "offline") throw new AssistantUnavailable(`Claude Code is ${availability.reason}.`, availability.reason);
            yield* real.ask(prompt, signal);
          } finally { capability.revoke(); }
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

/** Whether the panel can offer questions: { available: true }, or the fixed offline message and why. */
export const loader = async () => {
  const availability = await assistantAvailability({ track });
  const body = availability.state === "ready" ? { available: true } : { available: false, reason: availability.reason, message: OFFLINE, hint: OFFLINE_HINT };
  return Response.json(body, { headers: { "cache-control": "no-store" } });
};
