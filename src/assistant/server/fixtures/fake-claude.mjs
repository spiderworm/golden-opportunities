#!/usr/bin/env node
// Stands in for `claude -p` in the engine's tests, so they never spawn the real thing. It reports how it was
// started to FAKE_CLAUDE_REPORT, then behaves as FAKE_CLAUDE_MODE says.
import { writeFileSync } from "node:fs";

const mode = process.env.FAKE_CLAUDE_MODE ?? "ok";
let stdin = "";
process.stdin.on("data", (c) => (stdin += c));
process.stdin.on("end", () => {
  writeFileSync(process.env.FAKE_CLAUDE_REPORT, JSON.stringify({ pid: process.pid, cwd: process.cwd(), args: process.argv.slice(2), env: process.env, stdin }));
  const out = (o) => process.stdout.write(`${JSON.stringify(o)}\n`);
  const tools = mode === "foreign" ? ["mcp__orbital__query", "Bash"] : ["mcp__orbital__query"];
  out({ type: "system", subtype: "init", tools, mcp_servers: [{ name: "orbital", status: "connected" }], skills: [], slash_commands: [] });
  if (mode === "hang") {
    out({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "Thinking " } } });
    setInterval(() => {}, 1000);
    return;
  }
  out({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "Hello." } } });
  out({ type: "result", subtype: "success", is_error: false });
});
