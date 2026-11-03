// Runs the red-team regressions against a running dev server with the real provider:
//   node src/assistant/regression/run.ts http://[::1]:5173 [--after-q1] [case-id ...]
// Each case is one real answer. Prints each reply and any problems; exits 1 if any case failed. Dewey answers only
// within a game, so it starts one first; --after-q1 plays Q1 by holding course, so the ledger holds 2194-Q1 as a Q2
// player's does (Probe's Q2 red-team).

import type { WireEvent } from "../events.ts";
import { CASES } from "./cases.ts";

const args = process.argv.slice(2);
const afterQ1 = args.includes("--after-q1");
const [base = "http://[::1]:5173", ...only] = args.filter((a) => a !== "--after-q1");

// A new save: the station's first load sets its cookie.
const first = await fetch(`${base}/`, { redirect: "manual" });
const cookie = first.headers
  .getSetCookie()
  .map((c) => c.split(";")[0])
  .join("; ");
if (!cookie) throw new Error("No save cookie from the station.");
if (afterQ1) {
  const played = await fetch(`${base}/decide.data`, {
    method: "POST",
    headers: { cookie, origin: base, "content-type": "application/x-www-form-urlencoded" },
    body: "levers=",
  });
  if (!played.ok) throw new Error(`Playing Q1 failed: HTTP ${played.status}`);
}
let failed = 0;
for (const c of CASES.filter((c) => !only.length || only.includes(c.id))) {
  const res = await fetch(`${base}/api/assistant`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: base,
      "sec-fetch-site": "same-origin",
      cookie,
    },
    body: JSON.stringify({ question: c.question, history: [], pins: true }),
  });
  const events: WireEvent[] = (await res.text())
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  const text = events.flatMap((e) => (e.type === "text" ? [e.text] : [])).join("");
  // An empty, errored or unfinished answer fails outright: the checks are mostly absence checks.
  const broken = !res.ok
    ? `HTTP ${res.status}`
    : events.some((e) => e.type === "error")
      ? "ended with an error"
      : events.at(-1)?.type !== "done"
        ? "never finished"
        : !text.trim()
          ? "said nothing"
          : null;
  const problems = broken
    ? [broken]
    : c.checks.map((check) => check({ text, events })).filter((p) => p !== null);
  if (problems.length) failed++;
  console.log(
    `${problems.length ? "FAIL" : "ok  "} ${c.id} (${c.finding}) [${events
      .map((e) => e.type)
      .filter((t) => t !== "text")
      .join(", ")}]`,
  );
  console.log(`     ${text.replace(/\n+/g, " ")}`);
  for (const p of problems) console.log(`     - ${p}`);
}
process.exitCode = failed ? 1 : 0;
