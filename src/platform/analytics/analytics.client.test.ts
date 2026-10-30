// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from "vitest";

// A browser's localStorage, kept across "reloads" (fresh module imports).
const stored = new Map<string, string>();
const localStorageShim = {
  getItem: (k: string) => stored.get(k) ?? null,
  setItem: (k: string, v: string) => void stored.set(k, String(v)),
  removeItem: (k: string) => void stored.delete(k),
};

async function load(fetchImpl: typeof fetch) {
  vi.resetModules();
  vi.stubGlobal("localStorage", localStorageShim);
  vi.stubGlobal("fetch", fetchImpl);
  return import("./analytics.client");
}
const failing = (() => Promise.reject(new Error("offline"))) as typeof fetch;
const ok = (async (_url: string, init?: RequestInit) => Response.json(JSON.parse(String(init?.body)))) as typeof fetch;

beforeEach(() => stored.clear());
afterEach(() => vi.unstubAllGlobals());

test("an off choice the server never confirmed stays unconfirmed across reloads, until it does", async () => {
  let page = await load(failing);
  page.startAnalytics("instance-1");
  expect(await page.setSharing(false)).toBe(false);

  // Reload with the server still unreachable: the warning survives.
  page = await load(failing);
  page.startAnalytics("instance-1");
  expect(page.sharing()).toBe(false);
  expect(await page.sharingConfirmed()).toBe(false);

  // Reload once the server answers: it's told again at load, and confirms.
  page = await load(ok);
  page.startAnalytics("instance-1");
  expect(await page.sharingConfirmed()).toBe(true);
});

test("a confirmed choice needs nothing at load", async () => {
  const calls: string[] = [];
  const counting = (async (url: string, init?: RequestInit) => (calls.push(url), ok(url, init))) as typeof fetch;
  const page = await load(counting);
  page.startAnalytics("instance-1");
  expect(await page.sharingConfirmed()).toBe(true);
  expect(calls).toEqual([]);
});
