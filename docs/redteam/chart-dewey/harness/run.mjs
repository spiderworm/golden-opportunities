// Runs the show_chart attempts (attacks.mjs) against a dev server with the real provider, one answer at a time:
//   COOKIE='orbital_save=<id>' node run.mjs <base url> [--repeat n] [case-id ...]
// COOKIE is the save's cookie (Dewey answers only within a game).
// Logs each request, every NDJSON event and the reply to $RUNS/<id>[-n].json (default ../runs), prints each
// reply and its problems, and exits 1 if any case failed.
import { mkdirSync, writeFileSync } from "node:fs";
import { CASES } from "./attacks.mjs";

const args = process.argv.slice(2);
const base = args.shift() ?? "http://[::1]:5291";
const flag = (name) => (args.includes(name) ? (args.splice(args.indexOf(name), 1), true) : false);
const repeatAt = args.indexOf("--repeat");
const repeat = repeatAt >= 0 ? Number(args.splice(repeatAt, 2)[1]) : 1;
const q2 = flag("--q2");
const runs = new URL(`${process.env.RUNS ?? "../runs"}/`, import.meta.url);
mkdirSync(runs, { recursive: true });

let failed = 0;
for (const c of CASES.filter((c) => (!args.length || args.includes(c.id)) && (q2 || c.needs !== "q2"))) {
  for (let n = 1; n <= repeat; n++) {
    const id = repeat > 1 ? `${c.id}-${n}` : c.id;
    const request = { question: c.question, history: c.history ?? [], pins: true };
    const started = Date.now();
    const res = await fetch(`${base}/api/assistant`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: base, "sec-fetch-site": "same-origin", cookie: [process.env.COOKIE, "ob_entry=1"].filter(Boolean).join("; ") },
      body: JSON.stringify(request),
    });
    const raw = await res.text();
    const events = raw.split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return { type: "unparsed", line: l }; } });
    const text = events.flatMap((e) => (e.type === "text" ? [e.text] : [])).join("");
    // An empty, errored or unfinished answer fails outright: most checks are absence checks.
    const broken = !res.ok ? `HTTP ${res.status}` : events.some((e) => e.type === "error") ? "ended with an error" : events.at(-1)?.type !== "done" ? "never finished" : !text.trim() ? "said nothing" : null;
    const problems = broken ? [broken] : c.checks.map((check) => check({ text, events })).filter((p) => p !== null);
    if (problems.length) failed++;
    const tools = events.filter((e) => e.type === "data" || e.type === "comparison" || e.type === "chart").map((e) => ({ type: e.type, query: e.query, chart: e.chart, labels: e.labels, total: e.total, rows: e.rows?.length }));
    writeFileSync(new URL(`${id}.json`, runs), JSON.stringify({ id, group: c.group, at: new Date(started).toISOString(), ms: Date.now() - started, status: res.status, request, reply: text, tools, problems, events }, null, 2));
    console.log(`${problems.length ? "FAIL" : "ok  "} ${id} (${c.group}) ${Date.now() - started}ms [${events.map((e) => e.type).filter((t) => t !== "text").join(", ")}]`);
    console.log(`     ${text.replace(/\n+/g, " ")}`);
    for (const p of problems) console.log(`     - ${p}`);
  }
}
process.exitCode = failed ? 1 : 0;
