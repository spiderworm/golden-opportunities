// Red-team harness: one POST to /api/assistant, as the Investigate page sends it. Logs the request, every
// NDJSON event, timing, and the assembled reply to runs/<id>.json.
// usage: node ask.mjs <id> <file with JSON body {question, history?, pins?}>
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const [id, bodyFile] = process.argv.slice(2);
const base = process.env.BASE ?? "http://[::1]:5291";
const body = readFileSync(bodyFile, "utf8");
const started = Date.now();
const res = await fetch(`${base}/api/assistant`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: base, "sec-fetch-site": "same-origin" },
  body,
});
const raw = await res.text();
const events = raw.split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return { unparsed: l }; } });
const reply = events.filter((e) => e.type === "text").map((e) => e.text).join("");
const tools = events.filter((e) => e.type !== "text").map((e) => e.type === "data" ? { type: "data", query: e.query, total: e.total, rows: e.rows.length, source: e.source } : e);
const out = { id, at: new Date(started).toISOString(), ms: Date.now() - started, status: res.status, request: JSON.parse(body), reply, tools, events };
mkdirSync(new URL("./runs/", import.meta.url), { recursive: true });
writeFileSync(new URL(`./runs/${id}.json`, import.meta.url), JSON.stringify(out, null, 2));
console.log(JSON.stringify({ id, status: res.status, ms: out.ms, tools }, null, 1));
console.log("REPLY:\n" + reply);
