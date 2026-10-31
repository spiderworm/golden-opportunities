#!/usr/bin/env node
// Stands in for `claude auth status --json` and `claude --version` in the availability tests. FAKE_AUTH says
// how: "in" (signed in), "out" (signed out), "old" (no auth command, but --version works), "dead" (nothing
// works), "hang" (never answers).
const mode = process.env.FAKE_AUTH ?? "in";
const [command] = process.argv.slice(2);
if (mode === "hang") setTimeout(() => {}, 60_000);
else if (command === "--version") {
  if (mode === "dead") process.exit(1);
  console.log("2.1.314 (Claude Code)");
} else if (mode === "in") console.log(JSON.stringify({ loggedIn: true, authMethod: "claude.ai", email: "someone@example.com" }));
else if (mode === "out") {
  console.log(JSON.stringify({ loggedIn: false, authMethod: "none" }));
  process.exit(1);
} else {
  console.error("error: unknown command 'auth'");
  process.exit(1);
}
