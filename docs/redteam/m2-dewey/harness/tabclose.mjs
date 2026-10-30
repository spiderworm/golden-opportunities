// Muted headless Chromium (Playwright's Chromium passes --mute-audio; Web Audio and media are also silenced
// below), asks Dewey on the Investigate page, closes the tab after the first streamed text, then checks the
// claude process and its temp folder by pid.
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
const DEV = process.argv[2];
const kids = () => execSync("ps -axo pid=,ppid=,command=").toString().trim().split("\n").map((l) => l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/)).filter((m) => m && m[2] === DEV && /claude/.test(m[3])).map((m) => m[1]);
const browser = await chromium.launch({ args: ["--mute-audio"] });
const ctx = await browser.newContext();
await ctx.addInitScript(() => {
  const AC = window.AudioContext; if (AC) window.AudioContext = class extends AC { constructor(...a) { super(...a); const g = this.createGain(); g.gain.value = 0; g.connect(super.destination); Object.defineProperty(this, "destination", { get: () => g }); } };
  const play = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function (...a) { this.muted = true; return play.apply(this, a); };
});
const page = await ctx.newPage();
await page.goto("http://[::1]:5291/investigate?analytics-test=1");
await page.getByLabel("Question for Dewey").fill("Show revenue by month and genre, then units by month and format.");
const firstText = page.waitForResponse((r) => r.url().endsWith("/api/assistant"));
await page.getByLabel("Ask Dewey").getByRole("button").first().click();
await firstText;
let pid = []; for (let i = 0; i < 50 && !pid.length; i++) { pid = kids(); await new Promise((r) => setTimeout(r, 100)); }
const cwd = pid[0] ? execSync(`lsof -a -p ${pid[0]} -d cwd -Fn`).toString().split("\n").find((l) => l.startsWith("n"))?.slice(1) : null;
console.log("claude pid", pid, "cwd", cwd, existsSync(cwd ?? ""));
await page.close(); const t = Date.now();
await new Promise((r) => setTimeout(r, 1500));
let alive = ""; try { alive = execSync(`ps -p ${pid.join(",")} -o pid=`).toString().trim(); } catch {}
console.log(`+${Date.now() - t}ms after tab close: alive=[${alive}] cwd exists=${existsSync(cwd ?? "")}`);
await browser.close();
