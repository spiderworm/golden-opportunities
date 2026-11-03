// Closed mode through the real app: Vite loads the actual server build (every
// route, the root's middleware), and requests go through React Router's request
// handler as they do under `npm start`.
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequestHandler, type ServerBuild } from "react-router";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, expect, test } from "vitest";

const dir = mkdtempSync(path.join(tmpdir(), "orbital-closed-app-"));
process.env.ORBITAL_DATA_DIR = dir;
process.env.ORBITAL_ANALYTICS = "off";

let vite: ViteDevServer;
let handle: (request: Request) => Promise<Response>;
let resetClosedCheck: () => void;

beforeAll(async () => {
  vite = await createServer({
    configFile: path.resolve("vite.config.ts"),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    logLevel: "silent",
  });
  const build = (await vite.ssrLoadModule("virtual:react-router/server-build")) as ServerBuild;
  const handler = createRequestHandler(build, "development");
  handle = (request) => handler(request);
  // The same module instance the app's middleware uses.
  ({ resetClosedCheck } = await vite.ssrLoadModule("/src/platform/closed/closed.server.ts"));
}, 60_000);

afterAll(async () => {
  await vite?.close();
  rmSync(dir, { recursive: true, force: true });
});

const flag = path.join(dir, "closed");
const url = (p: string) => `http://localhost${p}`;
const CLOSED = "Sorry, we can't do that for you right now.";
// Closed mode runs before the entry page (#317), so whether the visitor has agreed doesn't matter.
const AGREED = { Cookie: "ob_entry=1" };
const VISITORS = [
  ["no agreement cookie", {}],
  ["agreed", AGREED],
] as const;
const get = (p: string, headers: Record<string, string> = {}) =>
  new Request(url(p), { headers: { Accept: "text/html", ...headers } });
const post = (p: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(url(p), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

test.each(VISITORS)(
  "closed, %s: every route answers 503 with the closed page, and no save is made",
  async (_who, headers) => {
    writeFileSync(flag, "");
    resetClosedCheck();
    const requests = [
      get("/", headers),
      get("/investigate", headers),
      get("/settings", headers),
      new Request(url("/game/new"), { method: "POST", headers }),
      post("/api/assistant", { messages: [{ role: "user", content: "Hello" }] }, headers),
      post("/api/query", { query: {} }, headers),
      post("/entry", {}, headers),
    ];
    for (const request of requests) {
      const response = await handle(request);
      const where = `${request.method} ${new URL(request.url).pathname}`;
      expect(response.status, where).toBe(503);
      expect(response.headers.get("Retry-After"), where).toBe("300");
      expect(await response.text(), where).toContain(CLOSED);
    }
    // A client navigation is sent to load the page itself, which is then the closed page.
    for (const [data, page] of [
      ["/investigate.data", "/investigate"],
      ["/_.data?_routes=root", "/"],
    ]) {
      const response = await handle(get(data!, headers));
      expect(response.status, data).toBe(204);
      expect(response.headers.get("X-Remix-Redirect"), data).toBe(page);
      expect(response.headers.get("X-Remix-Reload-Document"), data).toBe("true");
    }
    // A URL no route matches never reaches middleware: React Router answers it with
    // the game's 404 page, which runs no loader either.
    expect((await handle(get("/no-such-page", headers))).status).toBe(404);
    // Loaders and actions never ran, so nothing made a save.
    const saves = path.join(dir, "saves");
    expect(existsSync(saves) ? readdirSync(saves) : []).toEqual([]);
  },
  60_000,
);

test("reopening restores the entry page, then the game", async () => {
  rmSync(flag, { force: true });
  resetClosedCheck();
  const visitor = await handle(get("/"));
  expect(await visitor.text()).not.toContain(CLOSED);
  const player = await handle(get("/", AGREED));
  expect(player.status).toBe(200);
  const html = await player.text();
  expect(html).not.toContain(CLOSED);
  // The game itself: the root's loader ran, so its data is in the page.
  expect(html).toContain("instance");
}, 60_000);
