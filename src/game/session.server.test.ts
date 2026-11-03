import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { RouterContextProvider } from "react-router";
import { runQuery } from "../query/run-query.server";

vi.mock("../platform/analytics/analytics.server", () => ({ trackServer: vi.fn() }));
const directory = mkdtempSync(path.join(os.tmpdir(), "orbital-session-"));
vi.stubEnv("ORBITAL_DATA_DIR", directory);
const {
  saves,
  cookieSaveId,
  saveCookie,
  resolveSaveId,
  getGameSession,
  queryViewForSave,
  gameSessionMiddleware,
  newGamesPerMinute,
} = await import("./session.server");
const { submitPlan } = await import("./game.server");
afterAll(() => {
  rmSync(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});
const requestFor = (id?: string) =>
  new Request("http://localhost:5173/investigate", {
    headers: id ? { cookie: "orbital_save=" + id } : {},
  });
describe("cookie-selected game sessions", () => {
  it("rejects absent, forged, duplicate and unknown cookies instead of selecting a default save", () => {
    expect(() => resolveSaveId(requestFor())).toThrow("MISSING_SAVE");
    expect(() => resolveSaveId(requestFor("z".repeat(43)))).toThrow("MISSING_SAVE");
    expect(cookieSaveId(requestFor("../instance"))).toBeNull();
    expect(
      cookieSaveId(
        new Request("http://localhost", {
          headers: {
            cookie: "orbital_save=" + "a".repeat(43) + "; orbital_save=" + "b".repeat(43),
          },
        }),
      ),
    ).toBeNull();
  });
  it("bootstraps once before parallel loaders and emits a private HttpOnly cookie", async () => {
    const request = requestFor();
    const response = await gameSessionMiddleware(
      {
        request,
        url: new URL("http://localhost/investigate"),
        pattern: "/investigate",
        params: {},
        context: new RouterContextProvider(),
      },
      async () => {
        const [a, b] = await Promise.all([
          Promise.resolve().then(() => getGameSession(request)),
          Promise.resolve().then(() => getGameSession(request)),
        ]);
        expect(a.save.id).toBe(b.save.id);
        expect(a.date).toBe("2194-01-01");
        return new Response("ok");
      },
    );
    if (!(response instanceof Response)) throw Error("Missing middleware response");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toContain("HttpOnly; SameSite=Strict");
    const request2 = new Request(request.url, { headers: { cookie: cookie.split(";")[0] } });
    expect(getGameSession(request2).date).toBe("2194-01-01");
    expect(saveCookie(resolveSaveId(request2), new Request("https://localhost"))).toContain(
      "; Secure",
    );
  });
  it("starts at most 30 new games a minute by default, and only a positive integer changes that", async () => {
    expect(process.env.ORBITAL_NEW_GAMES_PER_MINUTE).toBeUndefined();
    for (const value of [undefined, "", "0", "-5", "2.5", "1e3", "off", " 40", "9999999999"])
      expect(newGamesPerMinute(value)).toBe(30);
    expect(newGamesPerMinute("1")).toBe(1);
    expect(newGamesPerMinute("100000")).toBe(100000);
    // A fresh window, then the module's own limit as loaded from the unset variable.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 120_000);
    try {
      const visit = () =>
        gameSessionMiddleware(
          {
            request: requestFor(),
            url: new URL("http://localhost/"),
            pattern: "/",
            params: {},
            context: new RouterContextProvider(),
          },
          async () => new Response(),
        ) as Promise<Response>;
      for (let i = 0; i < 30; i++)
        expect((await visit()).headers.get("set-cookie")).toMatch(/orbital_save_[0-9a-f]{8}=/);
      await expect(visit()).rejects.toMatchObject({ status: 429 });
      vi.setSystemTime(Date.now() + 60_000);
      expect((await visit()).status).toBe(200);
    } finally {
      vi.useRealTimers();
    }
  });
  it("does not bootstrap mutations", async () => {
    await expect(
      gameSessionMiddleware(
        {
          request: new Request("http://localhost/decide", { method: "POST" }),
          url: new URL("http://localhost/investigate"),
          pattern: "/investigate",
          params: {},
          context: new RouterContextProvider(),
        },
        async () => new Response(),
      ),
    ).rejects.toMatchObject({ status: 401 });
  });
  it("makes 2194-Q1 visible only after persisted play, separately for each save", () => {
    const a = saves.create();
    const b = saves.create();
    const query = { measure: "revenue", by: [], filter: { quarter: ["2194-Q1"] } };
    expect(runQuery(query, queryViewForSave(a)).total).toBe(0);
    submitPlan(
      new Request("http://localhost/decide", {
        method: "POST",
        headers: { origin: "http://localhost", cookie: "orbital_save=" + a.id },
      }),
      { levers: [] },
    );
    const played = getGameSession(requestFor(a.id));
    expect(played.date).toBe("2194-04-01");
    expect(runQuery(query, played.queryView).total).toBeGreaterThan(0);
    expect(runQuery(query, getGameSession(requestFor(b.id)).queryView).total).toBe(0);
    expect(
      runQuery({ measure: "revenue", by: [] }, getGameSession(requestFor(b.id)).queryView).total,
    ).toBeCloseTo(695243.6112);
  });
});
