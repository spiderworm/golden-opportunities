#!/usr/bin/env node
// Stands in for `claude -p` in the engine's tests, so they never spawn the real thing. It reports how it was
// started to FAKE_CLAUDE_REPORT, then behaves as FAKE_CLAUDE_MODE says (ok, foreign, tool-email, signed-out, crash, hang or stubborn).
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

const mode = process.env.FAKE_CLAUDE_MODE ?? "ok";
let stdin = "";
process.stdin.on("data", (c) => (stdin += c));
process.stdin.on("end", () => {
  // "stubborn": ignores SIGTERM, and starts a child (standing in for an MCP server) that ignores it too.
  let grandchild;
  if (mode === "stubborn") {
    process.on("SIGTERM", () => {});
    grandchild = spawn(
      process.execPath,
      ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"],
      { stdio: "ignore" },
    ).pid;
  }
  writeFileSync(
    process.env.FAKE_CLAUDE_REPORT,
    JSON.stringify({
      pid: process.pid,
      grandchild,
      cwd: process.cwd(),
      args: process.argv.slice(2),
      env: process.env,
      stdin,
    }),
  );
  const out = (o) => process.stdout.write(`${JSON.stringify(o)}\n`);
  const tools = mode === "foreign" ? ["mcp__orbital__query", "Bash"] : ["mcp__orbital__query"];
  out({
    type: "system",
    subtype: "init",
    tools,
    mcp_servers: [{ name: "orbital", status: "connected" }],
    skills: [],
    slash_commands: [],
  });
  if (mode === "tool-email") {
    out({
      type: "assistant",
      message: {
        content: [
          {
            type: "tool_use",
            id: "t1",
            name: "mcp__orbital__query",
            input: { filter: { title: ["private@example.org"] } },
          },
        ],
      },
    });
    out({
      type: "user",
      message: {
        content: [
          {
            type: "tool_result",
            tool_use_id: "t1",
            content: [{ type: "text", text: "No rows for private@example.org" }],
          },
        ],
      },
    });
    out({
      type: "result",
      subtype: "error",
      is_error: true,
      result: "failed for owner@example.com",
    });
    return;
  }
  // "signed-out": what a real signed-out run sends (measured on 2.1.314).
  if (mode === "signed-out") {
    out({ type: "assistant", message: { content: [] }, error: "authentication_failed" });
    out({
      type: "result",
      subtype: "success",
      is_error: true,
      result: "Not logged in · Please run /login",
    });
    return;
  }
  // "crash": exits with an error before saying anything.
  if (mode === "crash") process.exit(3);
  if (mode === "hang" || mode === "stubborn") {
    out({
      type: "stream_event",
      event: { type: "content_block_delta", delta: { type: "text_delta", text: "Thinking " } },
    });
    setInterval(() => {}, 1000);
    return;
  }
  out({
    type: "stream_event",
    event: { type: "content_block_delta", delta: { type: "text_delta", text: "Hello." } },
  });
  out({ type: "result", subtype: "success", is_error: false });
});
