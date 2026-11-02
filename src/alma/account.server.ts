// The signed-in account's own words, so Alma's text can refuse them (endless.md section 9, Probe's review).
// Claude Code puts the account's email in the model's context, and a model can turn it into a name. These are
// read from Claude Code's own account file, kept in memory only, and never logged, sent or shown.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

let cached: string[] | undefined;

/** Words of the account's names and email address, three letters or more, lower case. Empty if unknown. */
export function accountWords(env: NodeJS.ProcessEnv = process.env): string[] {
  if (cached) return cached;
  const words = new Set<string>();
  try {
    const file = path.join(env.CLAUDE_CONFIG_DIR || homedir(), ".claude.json");
    const account = JSON.parse(readFileSync(file, "utf8"))?.oauthAccount ?? {};
    for (const value of [account.displayName, account.fullName, typeof account.emailAddress === "string" ? account.emailAddress.split("@")[0] : undefined]) {
      if (typeof value === "string") for (const w of value.toLowerCase().split(/[^\p{L}]+/u)) if (w.length >= 3) words.add(w);
    }
  } catch {
    // No account file: nothing to refuse beyond the address checks.
  }
  return (cached = [...words]);
}
