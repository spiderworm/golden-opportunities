// Sends invalid-JSON bodies (refused 400 after admission, nothing spawned) until the hourly cap answers 429.
const base = "http://[::1]:5291"; const h = { "content-type": "application/json", origin: base, "sec-fetch-site": "same-origin" };
const t = Date.now(); let n = 0, last;
for (; n < 100; n++) { last = await fetch(`${base}/api/assistant`, { method: "POST", headers: h, body: "{" }); const body = await last.text(); if (last.status === 429) { console.log(`429 after ${n} invalid requests in ${Date.now() - t}ms: ${body}`); break; } }
const ok = await fetch(`${base}/api/assistant`, { method: "POST", headers: h, body: JSON.stringify({ question: "What was revenue in 2193-Q1?" }) });
console.log("then a valid question:", ok.status, await ok.text());
