import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeEach, expect, test, vi } from "vitest";

// DATA_DIR is read when instance.server.ts loads, so point it at a throwaway folder first.
const dir = mkdtempSync(path.join(tmpdir(), "orbital-closed-"));
process.env.ORBITAL_DATA_DIR = dir;

const track = vi.hoisted(() => vi.fn());
vi.mock("../analytics/analytics.server", () => ({ trackServer: track }));

const {
  CLOSED_FILE,
  closedDataResponse,
  closedMiddleware,
  isClosed,
  resetClosedCheck,
  RETRY_AFTER,
} = await import("./closed.server");
const { CLOSED_PAGE } = await import("./closed-page");

const args = { request: new Request("http://localhost/investigate") } as Parameters<
  typeof closedMiddleware
>[0];
const close = () => writeFileSync(CLOSED_FILE, "");
const open = () => rmSync(CLOSED_FILE, { force: true });

beforeEach(() => {
  open();
  delete process.env.ORBITAL_CLOSED;
  resetClosedCheck();
  track.mockClear();
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

test("the flag file is in the data folder", () => {
  expect(CLOSED_FILE).toBe(path.join(dir, "closed"));
});

test("while open, the request goes on to the game", async () => {
  const next = vi.fn(async () => new Response("game"));
  const response = (await closedMiddleware(args, next)) as Response;
  expect(next).toHaveBeenCalledOnce();
  expect(await response.text()).toBe("game");
});

test("while closed, the closed page answers 503 and nothing else runs", async () => {
  close();
  const next = vi.fn(async () => new Response("game"));
  const response = (await closedMiddleware(args, next)) as Response;
  expect(next).not.toHaveBeenCalled();
  expect(response.status).toBe(503);
  expect(response.headers.get("Retry-After")).toBe(String(RETRY_AFTER));
  expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
  expect(response.headers.get("X-Robots-Tag")).toBe("noindex");
  expect(await response.text()).toBe(CLOSED_PAGE);
});

test("a data request while closed reloads the page it was for", () => {
  const redirect = (path: string) =>
    closedDataResponse(new URL(`http://localhost${path}`)).headers.get("X-Remix-Redirect");
  expect(redirect("/investigate.data")).toBe("/investigate");
  expect(redirect("/_.data")).toBe("/");
  expect(redirect("/reports/_.data")).toBe("/reports/");
  expect(redirect("/decide.data?_routes=root,decide&q=1")).toBe("/decide?q=1");
  expect(redirect("//evil.example/x.data")).toBe("/evil.example/x");
});

test("ORBITAL_CLOSED=1 closes it without the file", () => {
  process.env.ORBITAL_CLOSED = "1";
  expect(isClosed()).toBe(true);
});

test("the flag is read at most once a second, so reopening shows within a second", () => {
  close();
  expect(isClosed(1000)).toBe(true);
  open();
  expect(isClosed(1500)).toBe(true);
  expect(isClosed(2000)).toBe(false);
});

test("one event when closed mode switches, none per request", () => {
  expect(isClosed(0)).toBe(false);
  expect(track).not.toHaveBeenCalled();
  close();
  for (const now of [1000, 1100, 1200]) isClosed(now);
  open();
  isClosed(2500);
  isClosed(3600);
  expect(track.mock.calls).toEqual([
    ["closed_mode_changed", { closed: true }],
    ["closed_mode_changed", { closed: false }],
  ]);
});

test("a server that starts closed says so once", () => {
  close();
  isClosed(0);
  isClosed(5000);
  expect(track.mock.calls).toEqual([["closed_mode_changed", { closed: true }]]);
});

test("the page loads nothing: no scripts, links or URLs, only its inlined portrait", () => {
  expect(CLOSED_PAGE).not.toMatch(/<script|<link|<iframe|@import|url\(/i);
  expect(CLOSED_PAGE).not.toMatch(/https?:\/\//);
  const sources = [...CLOSED_PAGE.matchAll(/\ssrc="([^"]*)"/g)].map((m) => m[1]!);
  expect(sources).toHaveLength(1);
  expect(sources[0]).toMatch(/^data:image\/webp;base64,/);
  expect(CLOSED_PAGE).toContain('<meta name="robots" content="noindex">');
});

test("the page's copy has no emoji", () => {
  expect(CLOSED_PAGE).not.toMatch(/\p{Extended_Pictographic}/u);
});
