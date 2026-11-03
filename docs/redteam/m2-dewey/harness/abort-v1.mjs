// Starts one answer, aborts it after the first streamed event, and watches the dev server's own descendants.
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
const DEV = process.argv[2], base = "http://[::1]:5291", afterMs = Number(process.argv[3] ?? 0);
const tree = () => {
  const out = execSync("ps -axo pid=,ppid=,pgid=,command=").toString().trim().split("\n").map((l) => l.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/)).filter(Boolean).map(([, pid, ppid, pgid, cmd]) => ({ pid, ppid, pgid, cmd }));
  const kids = new Set([DEV]); let grew = true;
  while (grew) { grew = false; for (const p of out) if (kids.has(p.ppid) && !kids.has(p.pid)) { kids.add(p.pid); grew = true; } }
  return out.filter((p) => p.pid !== DEV && kids.has(p.pid) && !/esbuild/.test(p.cmd)).map((p) => ({ pid: p.pid, pgid: p.pgid, cmd: p.cmd.slice(0, 90) }));
};
const cwdOf = (pid) => { try { return execSync(`lsof -a -p ${pid} -d cwd -Fn`).toString().split("\n").find((l) => l.startsWith("n"))?.slice(1); } catch { return null; } };
console.log("before:", JSON.stringify(tree()));
const ac = new AbortController(); const t0 = Date.now();
const res = await fetch(`${base}/api/assistant`, { method: "POST", signal: ac.signal, headers: { "content-type": "application/json", origin: base, "sec-fetch-site": "same-origin", cookie: "ob_entry=1" },
  body: JSON.stringify({ question: "Show revenue by month and genre, then units by month and format, then orders per day by weekday and quarter.", pins: true }) });
const reader = res.body.getReader(); const first = await reader.read();
if (afterMs) await new Promise((r) => setTimeout(r, afterMs));
const during = tree(); const claude = during.find((p) => /claude/.test(p.cmd) && /-p/.test(p.cmd)) ?? during[0];
const cwd = claude ? cwdOf(claude.pid) : null;
console.log(`first event at ${Date.now() - t0}ms: ${new TextDecoder().decode(first.value).slice(0, 100)}`);
console.log("during:", JSON.stringify(during.map((p) => ({ ...p, cmd: p.cmd.replace(/--system-prompt .*/, "--system-prompt …") }))));
console.log("claude cwd:", cwd, "exists:", cwd && existsSync(cwd));
ac.abort(); const tAbort = Date.now();
for (const wait of [500, 1500, 3500, 6000]) {
  await new Promise((r) => setTimeout(r, wait - (Date.now() - tAbort)));
  console.log(`+${wait}ms after abort: descendants=${JSON.stringify(tree().map((p) => p.pid + " " + p.cmd.slice(0, 40)))} cwd exists=${cwd && existsSync(cwd)}`);
}
