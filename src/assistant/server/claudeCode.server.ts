// The assistant's engine for now: headless Claude Code (`claude -p`), locked down so the model has our MCP tools
// and nothing else. Alma, the event director (src/alma), runs on the same code with no tool server at all: then
// the locks require no tools and no MCP servers. David chose Claude Code, run the way his other web UIs drive it on this Mac (subscription
// sign-in, no API key); to be revisited before release. The measurements behind every flag are in
// ../engine-notes.md.
//
// The locks, each checked by a test or at run time:
// - `--tools ""`: no built-in tools (no Bash, no file reads or edits, no web).
// - `--strict-mcp-config` with only our server in `--mcp-config`: no other MCP servers.
// - `--setting-sources ""` and `--disable-slash-commands`: no CLAUDE.md, settings, hooks, skills or commands
//   from this Mac. (`--safe-mode` would also drop our server.)
// - `--permission-mode dontAsk`, `--permission-prompts none`, `--allowedTools mcp__<ours>`: our tools run,
//   anything else is denied without asking.
// - `--no-session-persistence`: nothing is saved as a resumable session.
// - An empty temporary working directory, deleted afterwards, and a minimal environment: no app secrets
//   beyond the ones our server needs (`serverEnv`), which never enter the prompt.
// - The prompt goes in on stdin, never through a shell.
// - Fail closed: the run's first event lists its tools, MCP servers, skills and commands. Unless every tool is
//   ours and our server is the only one, connected, the process is killed before any answer is read.
// - Every email address is cut from everything it sends back: text, tool inputs and outputs, and errors
//   (Claude Code puts the account's email in the context).
// - Stopping it (abort, timeout, finally) signals its whole process group: SIGTERM, then SIGKILL after
//   `graceMs`, and the temporary folder is removed only once it has exited.

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import {
  AssistantUnavailable,
  type AssistantPrompt,
  type AssistantProvider,
  type ProviderEvent,
} from "./provider.server.ts";
import { emailRedactor, redactDeep, redactEmails } from "./redact.server.ts";

/** The one MCP server the assistant may use: how to start it, and the secrets it needs. */
export interface ToolServer {
  name: string;
  command: string;
  args: string[];
  /** Added to the process environment (Claude Code passes it on to the server); never on the command line. */
  env?: Record<string, string>;
}

/** The command line, exported for the test that checks every lock is on it. With no server, no tool is allowed. */
export function claudeArgs(
  prompt: AssistantPrompt,
  model: string,
  server: ToolServer | null,
): string[] {
  return [
    "-p",
    "--tools",
    "",
    "--strict-mcp-config",
    "--mcp-config",
    JSON.stringify({
      mcpServers: server ? { [server.name]: { command: server.command, args: server.args } } : {},
    }),
    "--setting-sources",
    "",
    "--disable-slash-commands",
    "--permission-mode",
    "dontAsk",
    "--permission-prompts",
    "none",
    ...(server ? ["--allowedTools", `mcp__${server.name}`] : []),
    "--no-session-persistence",
    "--model",
    model,
    "--system-prompt",
    prompt.system,
    "--output-format",
    "stream-json",
    "--verbose",
    "--include-partial-messages",
  ];
}

/** Only what claude needs to find its sign-in and run, plus our server's secrets: nothing else of the app's. */
/** The Claude Code binary to run: ORBITAL_ASSISTANT_CLAUDE, or `claude` from the PATH. */
export const claudeCommand = (env: NodeJS.ProcessEnv = process.env) =>
  env.ORBITAL_ASSISTANT_CLAUDE || "claude";

export function minimalEnv(
  env: NodeJS.ProcessEnv = process.env,
  serverEnv: Record<string, string> = {},
): NodeJS.ProcessEnv {
  const keep = [
    "PATH",
    "HOME",
    "USER",
    "LOGNAME",
    "LANG",
    "LC_ALL",
    "TMPDIR",
    "SHELL",
    "CLAUDE_CONFIG_DIR",
  ];
  return {
    ...Object.fromEntries(keep.filter((k) => env[k] !== undefined).map((k) => [k, env[k]])),
    ...serverEnv,
  };
}

type Block = {
  type?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
};
type Line = {
  type?: string;
  subtype?: string;
  tools?: unknown[];
  mcp_servers?: { name?: string; status?: string }[];
  skills?: unknown[];
  slash_commands?: unknown[];
  event?: { type?: string; delta?: { type?: string; text?: string } };
  message?: { content?: Block[] | string };
  is_error?: boolean;
  result?: string;
};

/** Why an init line fails the locks, or null if it passes. With no server (null), it may have no tools at all. */
export function lockViolation(line: Line, server: string | null): string | null {
  const { tools, mcp_servers: servers, skills, slash_commands: commands } = line;
  if (!Array.isArray(tools) || !Array.isArray(servers)) return "it didn't list its tools";
  const foreign = tools.filter(
    (t) => typeof t !== "string" || server === null || !t.startsWith(`mcp__${server}__`),
  );
  if (foreign.length) return `it had tools that aren't ours (${foreign.slice(0, 3).join(", ")})`;
  if (server === null) {
    if (servers.length) return "it had MCP servers";
  } else {
    if (servers.length !== 1 || servers[0]?.name !== server)
      return "it had MCP servers that aren't ours";
    if (servers[0].status !== "connected") return "our tool server didn't connect";
  }
  if (!Array.isArray(skills) || !Array.isArray(commands))
    return "it didn't list its skills and commands";
  if (skills.length || commands.length) return "it had skills or commands";
  return null;
}

const toolText = (content: unknown): string =>
  typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content
          .map((c) => (c && typeof c === "object" && "text" in c ? String(c.text) : ""))
          .join("")
      : "";

/** Reads claude's stream-json lines into events, enforcing the locks on the first event. */
export async function* readStream(
  lines: AsyncIterable<string>,
  kill: () => void,
  server: string | null,
): AsyncGenerator<ProviderEvent> {
  let checked = false;
  const calls = new Map<string, { name: string; input: unknown }>();
  const redactor = emailRedactor();
  const text = function* (t: string): Generator<ProviderEvent> {
    if (t) yield { type: "text", text: t };
  };
  for await (const raw of lines) {
    if (!raw.trim()) continue;
    let line: Line;
    try {
      line = JSON.parse(raw);
    } catch {
      continue;
    }
    if (line.type === "system" && line.subtype === "init") {
      const why = lockViolation(line, server);
      if (why) {
        kill();
        throw new AssistantUnavailable(
          `The assistant wasn't locked down (${why}), so it was stopped.`,
        );
      }
      checked = true;
      continue;
    }
    if (!checked) {
      kill();
      throw new AssistantUnavailable("The assistant didn't report its tools, so it was stopped.");
    }
    if (
      line.type === "stream_event" &&
      line.event?.type === "content_block_delta" &&
      line.event.delta?.type === "text_delta" &&
      line.event.delta.text
    ) {
      yield* text(redactor.push(line.event.delta.text));
    }
    const blocks = Array.isArray(line.message?.content) ? line.message.content : [];
    if (line.type === "assistant") {
      for (const b of blocks)
        if (b.type === "tool_use" && b.id && b.name)
          calls.set(b.id, { name: b.name, input: b.input });
    }
    if (line.type === "user") {
      for (const b of blocks) {
        const call =
          b.type === "tool_result" && b.tool_use_id ? calls.get(b.tool_use_id) : undefined;
        if (!call) continue;
        yield* text(redactor.flush());
        yield {
          type: "tool",
          name: call.name.slice(`mcp__${server ?? ""}__`.length),
          input: redactDeep(call.input),
          output: redactEmails(toolText(b.content)),
          isError: b.is_error === true,
        };
      }
    }
    if (line.type === "result" && line.is_error) {
      const result = String(line.result ?? "unknown error");
      // Signed out reads "Not logged in · Please run /login" (measured on 2.1.314).
      throw new AssistantUnavailable(
        `The assistant failed: ${result.slice(0, 200)}`,
        /not logged in|\/login|authenticat|api key/i.test(result) ? "signed_out" : "other",
      );
    }
  }
  yield* text(redactor.flush());
}

export function claudeCodeAssistant({
  server,
  command = claudeCommand(),
  model = process.env.ORBITAL_ASSISTANT_MODEL || "sonnet",
  timeoutMs = 120_000,
  graceMs = 2_000,
}: {
  /** null for none: the model gets no tools at all (Alma). */
  server: ToolServer | null;
  command?: string;
  model?: string;
  timeoutMs?: number;
  /** How long a stopped process gets to exit after SIGTERM before its whole group is sent SIGKILL. */
  graceMs?: number;
}): AssistantProvider {
  return {
    name: "claude-code",
    async *ask(prompt, signal) {
      // An answer cancelled before it started never starts: the abort listener below would never fire for it.
      if (signal.aborted) return;
      const cwd = mkdtempSync(path.join(tmpdir(), "orbital-assistant-"));
      // Its own process group, so stopping it also stops what it started (our MCP server, anything else).
      const child = spawn(command, claudeArgs(prompt, model, server), {
        cwd,
        env: minimalEnv(process.env, server?.env),
        stdio: ["pipe", "pipe", "pipe"],
        detached: true,
      });
      const exited = new Promise<number | null>((resolve) => {
        child.once("exit", (code) => resolve(code));
        child.once("error", () => resolve(null));
      });
      const signalGroup = (sig: NodeJS.Signals) => {
        if (child.pid === undefined) return;
        try {
          process.kill(-child.pid, sig);
        } catch {
          // The group is already gone.
        }
      };
      let stopping = false;
      let killTimer: NodeJS.Timeout | undefined;
      const kill = () => {
        if (stopping) return;
        stopping = true;
        signalGroup("SIGTERM");
        killTimer = setTimeout(() => signalGroup("SIGKILL"), graceMs);
      };
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        kill();
      }, timeoutMs);
      signal.addEventListener("abort", kill, { once: true });
      let stderr = "";
      child.stderr.on("data", (c: Buffer) => (stderr = (stderr + c.toString()).slice(-2000)));
      const spawned = new Promise<void>((resolve, reject) => {
        child.once("spawn", resolve);
        child.once("error", (e) => {
          const code = (e as NodeJS.ErrnoException).code;
          reject(
            new AssistantUnavailable(
              `The assistant couldn't start (${code ?? e.message}).`,
              code === "ENOENT" ? "missing" : "broken",
            ),
          );
        });
      });
      try {
        await spawned;
        child.stdin.end(prompt.message);
        let any = false;
        for await (const event of readStream(
          createInterface({ input: child.stdout }),
          kill,
          server?.name ?? null,
        )) {
          any = true;
          yield event;
        }
        if (timedOut)
          throw new AssistantUnavailable(
            `The assistant took longer than ${timeoutMs / 1000} seconds, so it was stopped.`,
            "timeout",
          );
        const code = await exited;
        // Exiting with an error before saying anything is Claude Code failing to start.
        if (!any && !signal.aborted)
          throw new AssistantUnavailable(
            code === 0
              ? "The assistant had nothing to say."
              : `The assistant stopped (exit ${code}). ${stderr.split("\n").filter(Boolean).pop() ?? ""}`.trim(),
            code === 0 ? "other" : "broken",
          );
      } finally {
        clearTimeout(timer);
        signal.removeEventListener("abort", kill);
        kill();
        // Wait for it to go (SIGKILL follows after graceMs), then make sure nothing it started is left.
        await Promise.race([exited, new Promise((r) => setTimeout(r, graceMs + 1_000))]);
        clearTimeout(killTimer);
        signalGroup("SIGKILL");
        rmSync(cwd, { recursive: true, force: true });
      }
    },
  };
}
