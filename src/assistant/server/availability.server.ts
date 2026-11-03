// Whether Dewey can answer on this machine. A reviewer who clones the repo may not have Claude Code installed or
// signed in (Goldy, M4), so the panel asks before the player types, and every failure ends in one fixed,
// in-character message rather than a stack trace or a spinner.
//
// The probe is `claude auth status --json`: local, about 0.3 s, exit 0 when signed in and 1 when not (measured on
// Claude Code 2.1.314). Its output includes the account's email, so only `loggedIn` is read and the rest is
// dropped. A Claude Code without `auth status` falls back to `claude --version`: installed counts as ready, and a
// real answer then finds out about sign-in. The probe runs the same binary, with the same environment, as a real
// answer's spawn (claudeCommand, minimalEnv), so it can't report ready on the strength of something the real
// run won't have, such as an API key in this process's environment (Probe, #67). The result is cached: "ready" until an answer shows otherwise, and
// "offline" for a minute, so signing in starts working without a restart.

import { execFile } from "node:child_process";
import { ASSISTANT_NAME } from "../name.ts";
import { claudeCommand, minimalEnv } from "./claudeCode.server.ts";

/** What the player sees when Claude Code isn't installed, isn't signed in, or won't start (Goldy, M4). */
export const OFFLINE = `${ASSISTANT_NAME}'s terminal is offline on this machine: it needs Claude Code installed and signed in.`;
export const OFFLINE_HINT = "To set it up, see docs/dewey-setup.md, then restart the game.";
/** The same, when Dewey runs on the Claude API (ORBITAL_ASSISTANT_PROVIDER=anthropic) and has no usable key. */
export const API_OFFLINE = `${ASSISTANT_NAME}'s terminal is offline on this machine: it needs a working Anthropic API key.`;
export const API_OFFLINE_HINT =
  "Set ANTHROPIC_API_KEY in the game server's environment, then restart the game.";

/** The offline message and hint for the engine this server runs. */
export const offlineCopy = (env: NodeJS.ProcessEnv = process.env) =>
  env.ORBITAL_ASSISTANT_PROVIDER === "anthropic"
    ? { message: API_OFFLINE, hint: API_OFFLINE_HINT }
    : { message: OFFLINE, hint: OFFLINE_HINT };

export type OfflineReason = "missing" | "signed_out" | "broken";
export type Availability = { state: "ready" } | { state: "offline"; reason: OfflineReason };
export type AvailabilityTrack = (event: string, props: Record<string, string>) => void;

const PROBE_TIMEOUT_MS = 5_000;
const OFFLINE_RECHECK_MS = 60_000;

interface ProbeOptions {
  command?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}

function run(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
): Promise<{ code: number | string | null; stdout: string }> {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      { env, timeout: timeoutMs, maxBuffer: 64 * 1024, windowsHide: true },
      (error, stdout) => {
        const out = String(stdout ?? "");
        if (!error) return resolve({ code: 0, stdout: out });
        const e = error as { code?: unknown; killed?: boolean };
        resolve({
          code:
            e.code === "ENOENT"
              ? "ENOENT"
              : e.killed
                ? "TIMEOUT"
                : typeof e.code === "number"
                  ? e.code
                  : 1,
          stdout: out,
        });
      },
    );
  });
}

/**
 * On the Claude API: ready with a key in ANTHROPIC_API_KEY, else offline ("missing"). Nothing is spawned or sent;
 * a refused key shows up on the first answer (markOffline, "signed_out").
 */
export async function probeApi({ env = process.env }: ProbeOptions = {}): Promise<Availability> {
  return env.ANTHROPIC_API_KEY?.trim()
    ? { state: "ready" }
    : { state: "offline", reason: "missing" };
}

/** Asks Claude Code whether it's there and signed in. Never throws. */
export async function probeAssistant({
  env = process.env,
  command = claudeCommand(env),
  timeoutMs = PROBE_TIMEOUT_MS,
}: ProbeOptions = {}): Promise<Availability> {
  const spawnEnv = minimalEnv(env);
  const status = await run(command, ["auth", "status", "--json"], spawnEnv, timeoutMs);
  if (status.code === "ENOENT") return { state: "offline", reason: "missing" };
  let loggedIn: unknown;
  try {
    loggedIn = (JSON.parse(status.stdout) as { loggedIn?: unknown }).loggedIn;
  } catch {
    // Not JSON: an older Claude Code, or one that failed. See whether it runs at all.
  }
  if (loggedIn === true) return { state: "ready" };
  if (loggedIn === false) return { state: "offline", reason: "signed_out" };
  const version = await run(command, ["--version"], spawnEnv, timeoutMs);
  if (version.code === "ENOENT") return { state: "offline", reason: "missing" };
  return version.code === 0 ? { state: "ready" } : { state: "offline", reason: "broken" };
}

let cached: { at: number; result: Promise<Availability> } | undefined;
let reported: OfflineReason | null = null;

function report(result: Availability, track?: AvailabilityTrack, when = "probe") {
  // Once per change of state, content-free: just why.
  const reason = result.state === "offline" ? result.reason : null;
  if (reason && reason !== reported) track?.("assistant_unavailable", { reason, when });
  reported = reason;
}

/**
 * Dewey's availability, probed once and cached. Under the fake provider (tests, or trying the panel without
 * Claude Code) it's always ready, since nothing is spawned.
 */
export function assistantAvailability({
  env = process.env,
  track,
  now = Date.now(),
  probe = env.ORBITAL_ASSISTANT_PROVIDER === "anthropic" ? probeApi : probeAssistant,
}: {
  env?: NodeJS.ProcessEnv;
  track?: AvailabilityTrack;
  now?: number;
  probe?: (o: ProbeOptions) => Promise<Availability>;
} = {}): Promise<Availability> {
  if (env.ORBITAL_ASSISTANT_PROVIDER === "fake" || env.VITEST)
    return Promise.resolve({ state: "ready" });
  if (cached) {
    const stale = cached.result.then(
      (r) => r.state === "offline" && now - cached!.at > OFFLINE_RECHECK_MS,
    );
    return stale.then((s) => (s ? fresh() : cached!.result));
  }
  return fresh();

  function fresh() {
    const result = probe({ env }).then((r) => (report(r, track), r));
    cached = { at: now, result };
    return result;
  }
}

/** A real answer found Dewey offline (Claude Code gone, signed out, or failing to start): remember it. */
export function markOffline(reason: OfflineReason, track?: AvailabilityTrack, now = Date.now()) {
  const result: Availability = { state: "offline", reason };
  report(result, track, "answer");
  cached = { at: now, result: Promise.resolve(result) };
}

export const resetAvailabilityForTests = () => {
  cached = undefined;
  reported = null;
};
