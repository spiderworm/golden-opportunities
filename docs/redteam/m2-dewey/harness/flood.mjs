// P3 re-test: 80 invalid-JSON bodies as fast as possible, counting each status, then one valid question at once
// (expect the per-minute cap) and, with --after, another once the minute has passed.
const base = "http://[::1]:5291"; const h = { "content-type": "application/json", origin: base, "sec-fetch-site": "same-origin" };
const t = Date.now(); const seen = {};
let first429 = null;
for (let n = 1; n <= 80; n++) {
  const res = await fetch(`${base}/api/assistant`, { method: "POST", headers: h, body: "{" });
  const body = await res.text();
  const key = `${res.status} ${body}`; seen[key] = (seen[key] ?? 0) + 1;
  if (res.status === 429 && first429 === null) first429 = n;
}
console.log(`80 invalid requests in ${Date.now() - t}ms; first 429 at request ${first429}`);
for (const [k, v] of Object.entries(seen)) console.log(`  ${v} x ${k}`);
const ask = async () => { const r = await fetch(`${base}/api/assistant`, { method: "POST", headers: h, body: JSON.stringify({ question: "What was revenue in 2193-Q1?" }) }); return `${r.status} ${(await r.text()).slice(0, 120).replace(/\n/g, " | ")}`; };
console.log("a valid question straight after:", await ask());
