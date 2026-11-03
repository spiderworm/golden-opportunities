import { afterAll, describe, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
import path from "node:path";
const directory = await vi.hoisted(async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  return mkdtempSync(tmpdir() + "/orbital-usage-");
});
vi.mock("../../platform/analytics/instance.server", () => ({
  DATA_DIR: directory,
  instanceId: () => "0123abcd-0000-4000-8000-000000000000",
}));
vi.mock("../../platform/analytics/analytics.server", () => ({ trackServer: vi.fn() }));

import { cookieSaveId, saveCookieName, saves } from "~/game/session.server";
import { spend } from "~/platform/usage.server";
import { deweyUsage, gameOf } from "./usage.server.ts";

afterAll(() => rmSync(directory, { recursive: true, force: true }));

const question = (cookie?: string) =>
  new Request("http://127.0.0.1:5173/api/assistant", {
    method: "POST",
    headers: cookie ? { cookie } : {},
  });
/** Another save's id in the same form, naming no save at all. */
const forged = (id: string) => id.slice(0, -1) + (id.endsWith("A") ? "B" : "A");

describe("only a question with a real game counts against the daily caps (Probe's red-team of #319)", () => {
  it("doesn't count a question without a save cookie: Dewey says to start a game and asks no model", () => {
    const counted: string[] = [];
    expect(deweyUsage(question(), { count: (_, v) => (counted.push(String(v)), null) })).toBeNull();
    expect(counted).toEqual([]);
  });

  it("doesn't count a question whose save cookie names no save", () => {
    const real = saves.create();
    const counted: string[] = [];
    const cookie = `${saveCookieName()}=${forged(real.id)}`;
    // A well-formed id, so this is a save that doesn't exist, not a cookie that doesn't parse.
    expect(cookieSaveId(question(cookie))).toBe(forged(real.id));
    expect(
      deweyUsage(question(cookie), { count: (_, v) => (counted.push(String(v)), null) }),
    ).toBeNull();
    expect(counted).toEqual([]);
  });

  it("counts a question with a real game, against that game", () => {
    const real = saves.create();
    const counted: [string, string | null][] = [];
    deweyUsage(question(`${saveCookieName()}=${real.id}`), {
      count: (kind, visitor) => (counted.push([kind, visitor]), null),
    });
    expect(counted).toEqual([["dewey", real.id]]);
  });

  it("so questions without a game can't put Dewey to rest for a real player (Probe's case)", () => {
    const file = path.join(directory, "usage-probe.json");
    const env = { ORBITAL_DEWEY_DAILY_CAP: "12" };
    const count: typeof spend = (kind, visitor) => spend(kind, visitor, { env, file });
    const real = saves.create();
    for (let i = 0; i < 15; i++) deweyUsage(question(), { count });
    for (let i = 0; i < 15; i++)
      deweyUsage(question(`${saveCookieName()}=${forged(real.id)}`), { count });
    expect(deweyUsage(question(`${saveCookieName()}=${real.id}`), { count })).toBeNull();
  });
});

describe("a question's game", () => {
  it("is its save when the cookie names one, else none", () => {
    const real = saves.create();
    expect(gameOf(question(`${saveCookieName()}=${real.id}`))).toBe(real.id);
    expect(gameOf(question())).toBeNull();
    expect(gameOf(question(`${saveCookieName()}=${forged(real.id)}`))).toBeNull();
  });
});
