// POST /api/assistant asks; GET says whether the assistant can answer on this machine. Wires the real pieces
// together; the work is in server/ask.server.ts and server/availability.server.ts.

import { SaveError } from "~/game/store.server";
import { cookieSaveId, resolveSaveId, saves } from "~/game/session.server";
import { createHash } from "node:crypto";
import { quarterAt } from "~/simulation/quarters";
import { backstoryOf, type BackstoryText } from "~/alma/backstory";
import { catalogNames } from "~/alma/backstory.server";
import { trackServer } from "~/platform/analytics/analytics.server";
import { getAssistant } from "./server/assistant.server.ts";
import { ask, type ServerTrack } from "./server/ask.server.ts";
import { deweyUsage, gameOf } from "./server/usage.server.ts";
import { assistantAvailability, offlineCopy } from "./server/availability.server.ts";
import { anthropicAssistant } from "./server/anthropicApi.server.ts";
import { claudeCodeAssistant, type ToolServer } from "./server/claudeCode.server.ts";
import { fakeLookupAssistant } from "./server/fakeLookups.server.ts";
import { queryToken } from "./server/queryToken.server.ts";
import { AssistantUnavailable, type AssistantProvider } from "./server/provider.server.ts";
import { orbitalToolServer } from "./tools/toolServer.server.ts";
import { checkQuery } from "./tools/definitions.ts";
import { agentEvidence, dropAgentEvidence } from "~/query/agent-evidence.server";
import { validateQuery } from "~/query/validate";
import type { Route } from "./+types/route";

// Content-free events, except the withheld sentences ask.server keeps, held on this machine and never sent. What
// the player typed is recorded in the browser, held on the device.
const track: ServerTrack = (event, props, options) => trackServer(event, props, options);

const unavailable = (message: string): AssistantProvider => ({
  name: "unavailable",
  async *ask() {
    yield { type: "text", text: message };
  },
});

/**
 * Builds a provider around this answer's query token: the tool server gets it in its environment, and it's
 * revoked when the answer ends, however it ends. `probe` checks first that Claude Code can answer here.
 */
function withQueryToken(
  request: Request,
  pins: boolean,
  build: (server: ToolServer) => AssistantProvider,
  probe: boolean,
): AssistantProvider {
  try {
    const capability = queryToken(request);
    try {
      const real = build(orbitalToolServer(capability.token, { pins }));
      return {
        name: real.name,
        // Each lookup's raw evidence for the panel, from this answer's token only (query/agent-evidence.server.ts),
        // keyed on the query the handler ran: the tool server's checked query, validated as the handler does.
        evidenceFor(query) {
          try {
            return agentEvidence(capability.token, validateQuery(checkQuery(query)));
          } catch {
            return null;
          }
        },
        async *ask(prompt, signal) {
          try {
            if (probe) {
              // Known offline (no Claude Code, signed out, failing to start): say so without spawning anything.
              const availability = await assistantAvailability({ track });
              // Cancelled while the probe ran: stop here rather than spawn for no one (Audit, #67).
              if (signal.aborted) return;
              if (availability.state === "offline")
                throw new AssistantUnavailable(
                  `Claude Code is ${availability.reason}.`,
                  availability.reason,
                );
            }
            yield* real.ask(prompt, signal);
          } finally {
            capability.revoke();
            // The answer is over: its evidence goes with its token.
            dropAgentEvidence(capability.token);
          }
        },
      };
    } catch (error) {
      capability.revoke();
      dropAgentEvidence(capability.token);
      throw error;
    }
  } catch (e) {
    return unavailable(
      e instanceof SaveError && e.code === "MISSING_SAVE"
        ? "Start a game, then try your question again."
        : "The assistant is unavailable right now. Try again in a moment.",
    );
  }
}

function provider(request: Request, { pins }: { pins: boolean }): AssistantProvider {
  return getAssistant(
    () =>
      process.env.ORBITAL_ASSISTANT_PROVIDER === "anthropic"
        ? // The Claude API: our tools run in this process with this answer's token, and the key is the only probe.
          withQueryToken(
            request,
            pins,
            (server) => anthropicAssistant({ toolEnv: server.env ?? {} }),
            false,
          )
        : withQueryToken(request, pins, (server) => claudeCodeAssistant({ server }), true),
    process.env,
    // No model, but real lookups through the tool server's own code (fakeLookups.server.ts).
    () => withQueryToken(request, pins, (server) => fakeLookupAssistant(server.env ?? {}), false),
  );
}

/**
 * Where the game is, for the chat's timeline (David, 3 Nov 2026), or null without a game. `quarter`: the one whose
 * first day is the station date the header shows (game/quarters.ts's stationDate). `game`: a key for this game, so
 * turns from before Play again or Reset game (a new save) read as earlier (Chart, #390). It's a one-way hash of the
 * save's id, which the cookie carries, so the browser never sees the id.
 */
function timelineOf(request: Request): { quarter: string; game: string } | null {
  try {
    const save = saves.read(resolveSaveId(request));
    const game = createHash("sha256")
      .update(`dewey-timeline:${save.id}`)
      .digest("hex")
      .slice(0, 16);
    return { quarter: quarterAt(save.played.length), game };
  } catch {
    return null;
  }
}

/** The game's backstory, checked again as it's read, or null without a game (docs/design/backstory.md). */
function backstory(request: Request): BackstoryText | null {
  try {
    return backstoryOf(saves.read(resolveSaveId(request)), catalogNames());
  } catch {
    return null;
  }
}

/**
 * This question against the daily caps, only when it comes with a real game (server/usage.server.ts); never under
 * Vitest, which mustn't write .data.
 */
const usage = (request: Request) => (process.env.VITEST ? null : deweyUsage(request));

export const action = ({ request }: Route.ActionArgs) =>
  ask(
    request,
    (options) => provider(request, options),
    track,
    undefined,
    undefined,
    backstory,
    usage,
    // Only a question with a real game counts toward the hour (Probe's red-team of #319).
    (request) => gameOf(request) !== null,
    // Which minute cap counts it, from the cookie alone, before any save is read (Frank's review of #351).
    (request) => cookieSaveId(request) !== null,
  );

/** Whether the panel can offer questions: { available: true }, or the fixed offline message and why. */
export const loader = async ({ request }: Route.LoaderArgs) => {
  const availability = await assistantAvailability({ track });
  // The greeting's backstory sentence, checked; shown as plain text, never rendered (section 6).
  const short = backstory(request)?.short;
  const timeline = timelineOf(request);
  const body = {
    ...(availability.state === "ready"
      ? { available: true }
      : { available: false, reason: availability.reason, ...offlineCopy() }),
    ...(short ? { short } : {}),
    ...(timeline ?? {}),
  };
  return Response.json(body, { headers: { "cache-control": "no-store" } });
};
