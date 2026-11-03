#!/usr/bin/env node
// Stands in for `claude auth status --json` and `claude --version` in the availability tests. It's run with the
// same minimal environment as a real answer, so its mode comes from CLAUDE_CONFIG_DIR, one of the few
// variables that survive (and the one that really decides sign-in): its last part is "in" (signed in), "out"
// (signed out), "old" (no auth command, but --version works), "dead" (nothing works), "hang" (never answers),
// or "key" (signed in only if ANTHROPIC_API_KEY reached it).
import path from "node:path";

const mode = path.basename(process.env.CLAUDE_CONFIG_DIR ?? "in");
const [command] = process.argv.slice(2);
if (mode === "hang") setTimeout(() => {}, 60_000);
else if (command === "--version") {
  if (mode === "dead") process.exit(1);
  console.log("2.1.314 (Claude Code)");
} else if (mode === "key") {
  console.log(JSON.stringify({ loggedIn: Boolean(process.env.ANTHROPIC_API_KEY) }));
  process.exit(process.env.ANTHROPIC_API_KEY ? 0 : 1);
} else if (mode === "in")
  console.log(
    JSON.stringify({ loggedIn: true, authMethod: "claude.ai", email: "someone@example.com" }),
  );
else if (mode === "out") {
  console.log(JSON.stringify({ loggedIn: false, authMethod: "none" }));
  process.exit(1);
} else {
  console.error("error: unknown command 'auth'");
  process.exit(1);
}
