// Two copies of the app on one host (David's bug, 3 Nov 2026): a browser keeps cookies by host, not port, so live
// on :5173 and an agent's dev server on :5202 see each other's cookies. Each copy here is its own module instance,
// with its own data folder and instance ID, and one cookie jar plays the browser.
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { RouterContextProvider } from "react-router";

const { trackServer } = vi.hoisted(() => ({ trackServer: vi.fn() }));
vi.mock("../platform/analytics/analytics.server", () => ({ trackServer }));
const folders: string[] = [];
afterAll(() => {
  for (const folder of folders) rmSync(folder, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

/** A copy of the app: its own data folder, so its own saves and instance ID. */
async function copy() {
  const folder = mkdtempSync(path.join(os.tmpdir(), "orbital-copy-"));
  folders.push(folder);
  vi.stubEnv("ORBITAL_DATA_DIR", folder);
  vi.resetModules();
  return import("./session.server");
}

/** The browser's cookies for localhost, any port. */
function jar() {
  const cookies = new Map<string, string>();
  return {
    cookies,
    header: () => [...cookies].map(([name, value]) => `${name}=${value}`).join("; "),
    take(response: Response) {
      for (const line of response.headers.getSetCookie()) {
        const [pair] = line.split(";");
        const at = pair!.indexOf("=");
        cookies.set(pair!.slice(0, at), pair!.slice(at + 1));
      }
    },
  };
}

async function visit(
  app: Awaited<ReturnType<typeof copy>>,
  browser: ReturnType<typeof jar>,
  port: number,
) {
  const url = `http://localhost:${port}/investigate`;
  let seen = "";
  const response = await app.gameSessionMiddleware(
    {
      request: new Request(url, { headers: { cookie: browser.header() } }),
      url: new URL(url),
      params: {},
      context: new RouterContextProvider(),
      pattern: "/investigate",
    } as never,
    async () => {
      seen = app.resolveSaveId(new Request(url, { headers: { cookie: browser.header() } }));
      return new Response("ok");
    },
  );
  browser.take(response as Response);
  return seen;
}

describe("the save cookie, with two copies of the app on one host", () => {
  it("keeps each copy's game when the player goes back and forth", async () => {
    const live = await copy();
    const other = await copy();
    expect(live.saveCookieName()).not.toBe(other.saveCookieName());
    expect(live.saveCookieName()).toMatch(/^orbital_save_[0-9a-f]{8}$/);
    const browser = jar();
    const first = await visit(live, browser, 5173);
    const elsewhere = await visit(other, browser, 5202);
    expect(elsewhere).not.toBe(first);
    // Back on live: the same game, not a new one.
    expect(await visit(live, browser, 5173)).toBe(first);
    expect(await visit(other, browser, 5202)).toBe(elsewhere);
  });

  it("carries on a game kept under the old shared name, and moves it to this copy's own", async () => {
    const live = await copy();
    const old = live.saves.create().id;
    const browser = jar();
    browser.cookies.set("orbital_save", old);
    expect(await visit(live, browser, 5173)).toBe(old);
    expect(browser.cookies.get(live.saveCookieName())).toBe(old);
    // Once it has its own, another copy rewriting the old name changes nothing here.
    browser.cookies.set("orbital_save", "x".repeat(43));
    expect(await visit(live, browser, 5173)).toBe(old);
  });

  it("starts a new game when the cookie names a save this copy doesn't hold, and records why", async () => {
    const live = await copy();
    const browser = jar();
    browser.cookies.set(live.saveCookieName(), "a".repeat(43));
    trackServer.mockClear();
    const id = await visit(live, browser, 5173);
    expect(id).not.toBe("a".repeat(43));
    expect(browser.cookies.get(live.saveCookieName())).toBe(id);
    expect(trackServer).toHaveBeenCalledWith("game_save_created", {
      version: 1,
      replacing: "missing",
    });
    // A first visit, with no cookie at all, is just a new game.
    trackServer.mockClear();
    await visit(live, jar(), 5173);
    expect(trackServer).toHaveBeenCalledWith("game_save_created", { version: 1 });
  });
});
