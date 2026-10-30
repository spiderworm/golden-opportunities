// Starts one answer and aborts it as soon as the dev server has spawned its claude process (before any answer
// is read, so it costs no model output), then checks what survived. The claude process is found once, as a
// direct child of the dev server; after that, survivors are looked for by its process group and by its temp
// folder, never by parent, so a process re-parented to launchd still counts.
// usage: node abort.mjs <dev server pid>   (machine paths are printed as $HOME and $TMPDIR)
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { realpathSync } from "node:fs";
const DEV = process.argv[2], base = "http://[::1]:5291";
const tmp = realpathSync(tmpdir());
const clean = (s) => String(s).replaceAll(tmp, "$TMPDIR").replaceAll(homedir(), "$HOME").replace(/--system-prompt .*/, "--system-prompt …");
const sh = (cmd) => { try { return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString(); } catch { return ""; } };
const ps = () => sh("ps -axo pid=,ppid=,pgid=,command=").trim().split("\n").map((l) => l.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/)).filter(Boolean).map(([, pid, ppid, pgid, cmd]) => ({ pid, ppid, pgid, cmd }));
const cwdOf = (pid) => sh(`lsof -a -p ${pid} -d cwd -Fn`).split("\n").find((l) => l.startsWith("n"))?.slice(1) ?? null;
// Every process, whatever its parent, in the group or with anything open under the folder.
const survivors = (pgid, folder) => {
  const inGroup = ps().filter((p) => p.pgid === pgid).map((p) => `${p.pid} ppid=${p.ppid} pgid=${p.pgid} ${clean(p.cmd).slice(0, 70)}`);
  const inFolder = existsSync(folder) ? sh(`lsof -t +D ${folder}`).trim().split("\n").filter(Boolean) : [];
  return { inGroup, inFolder, folderExists: existsSync(folder) };
};

const ac = new AbortController();
const t0 = Date.now();
const res = await fetch(`${base}/api/assistant`, { method: "POST", signal: ac.signal, headers: { "content-type": "application/json", origin: base, "sec-fetch-site": "same-origin" },
  body: JSON.stringify({ question: "What was revenue in 2193-Q1?", pins: true }) });
const reader = res.body.getReader();
void reader.read().catch(() => {}); // starts the stream, so the server spawns claude
let claude;
while (!claude && Date.now() - t0 < 10_000) {
  claude = ps().find((p) => p.ppid === DEV && /claude/.test(p.cmd));
  if (!claude) await new Promise((r) => setTimeout(r, 20));
}
if (!claude) throw new Error("claude never appeared under the dev server");
let folder = null;
while (!folder && Date.now() - t0 < 10_000) folder = cwdOf(claude.pid);
await new Promise((r) => setTimeout(r, 300)); // let its MCP server start, so there is something to orphan
const group = ps().filter((p) => p.pgid === claude.pgid);
console.log(`claude pid=${claude.pid} pgid=${claude.pgid}, found ${Date.now() - t0}ms after the request`);
console.log(`cwd ${clean(folder)} exists=${existsSync(folder)}`);
console.log("its process group before abort:");
for (const p of group) console.log(`  ${p.pid} ppid=${p.ppid} ${clean(p.cmd).slice(0, 110)}`);
ac.abort();
const tAbort = Date.now();
for (const wait of [500, 1500, 3500, 6000]) {
  await new Promise((r) => setTimeout(r, wait - (Date.now() - tAbort)));
  const s = survivors(claude.pgid, folder);
  const pids = group.map((p) => p.pid).join(",");
  console.log(`+${wait}ms after abort: group ${claude.pgid}=${JSON.stringify(s.inGroup)} under folder=${JSON.stringify(s.inFolder)} folder exists=${s.folderExists} ps -p ${pids}: [${sh(`ps -p ${pids} -o pid=`).trim().replace(/\s+/g, " ")}]`);
}
