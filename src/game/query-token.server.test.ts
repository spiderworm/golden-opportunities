import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
const { directory } = await vi.hoisted(async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  return { directory: mkdtempSync(tmpdir() + "/game-query-") };
});
vi.mock("../platform/analytics/instance.server", () => ({
  DATA_DIR: directory,
  instanceId: () => "0123abcd-0000-4000-8000-000000000000",
}));
vi.mock("../platform/analytics/analytics.server", () => ({ trackServer: vi.fn() }));
import { issueGameQueryToken, QUERY_TOKEN_TTL_MS } from "./query-token.server";
import { saves } from "./session.server";
import { submitPlan } from "./game.server";
import { createQueryHandler } from "../query/http.server";
import { isLocalBrowserRequest } from "../query/access.server";
import { trackServer } from "../platform/analytics/analytics.server";

const revokers: (() => void)[] = [];
const issue = (id: string) => {
  const cap = issueGameQueryToken(id);
  revokers.push(cap.revoke);
  return cap;
};
afterEach(() => {
  revokers.splice(0).forEach((revoke) => revoke());
  vi.useRealTimers();
  vi.clearAllMocks();
});
afterAll(() => rmSync(directory, { recursive: true, force: true }));
const target = "http://localhost:5173/api/query";
const query = { measure: "revenue", by: [], filter: { quarter: ["2194-Q1"] } };
function request(id?: string, token?: string, body: unknown = query) {
  return new Request(target, {
    method: "POST",
    headers: {
      origin: "http://localhost:5173",
      "content-type": "application/json",
      ...(id ? { cookie: "orbital_save=" + id } : {}),
      ...(token ? { authorization: "Bearer " + token } : {}),
    },
    body: JSON.stringify(body),
  });
}
const handle = () => createQueryHandler({ track: () => {} });
function play(id: string) {
  submitPlan(
    new Request("http://localhost/decide", {
      method: "POST",
      headers: { origin: "http://localhost", cookie: "orbital_save=" + id },
    }),
    { levers: [] },
  );
}
describe("server-owned query capabilities", () => {
  it("requires a real save, rejects anonymous and forged cookies, and never bootstraps an API save", async () => {
    const run = vi.fn();
    const h = createQueryHandler({ run, track: () => {} });
    expect((await h(request())).status).toBe(401);
    expect((await h(request("a".repeat(43)))).status).toBe(401);
    expect(() => issueGameQueryToken("a".repeat(43))).toThrow("MISSING_SAVE");
    expect(run).not.toHaveBeenCalled();
  });
  it("isolates browser saves and uses token ownership even with another save cookie", async () => {
    const a = saves.create();
    const b = saves.create();
    play(a.id);
    const capA = issue(a.id);
    const capB = issue(b.id);
    const h = handle();
    expect((await (await h(request(a.id))).json()).total).toBeGreaterThan(0);
    expect((await (await h(request(b.id))).json()).total).toBe(0);
    expect((await (await h(request(b.id, capA.token))).json()).total).toBeGreaterThan(0);
    expect((await (await h(request(a.id, capB.token))).json()).total).toBe(0);
  });
  it("ends the answer capability when the save revision advances, avoiding mixed comparisons", async () => {
    const a = saves.create();
    const cap = issue(a.id);
    const h = handle();
    expect((await h(request(undefined, cap.token))).status).toBe(200);
    play(a.id);
    const response = await h(request(undefined, cap.token));
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("SESSION_ENDED");
    const fresh = issue(a.id);
    expect((await (await h(request(undefined, fresh.token))).json()).total).toBeGreaterThan(0);
  });
  it("keeps the answer capability when the player marks the arrival alert seen", async () => {
    const a = saves.create();
    const cap = issue(a.id);
    const h = handle();
    saves.markAlertSeen(a.id);
    expect((await h(request(undefined, cap.token))).status).toBe(200);
  });
  it("revokes and expires capabilities with bounded content-free errors", async () => {
    const save = saves.create();
    const cap = issue(save.id);
    cap.revoke();
    cap.revoke();
    const response = await handle()(request(undefined, cap.token));
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
    const text = await response.text();
    expect(text).toContain("SESSION_ENDED");
    expect(text).not.toContain(cap.token);
    expect(text).not.toContain(save.id);
    vi.useFakeTimers();
    const expiring = issue(save.id);
    await vi.advanceTimersByTimeAsync(QUERY_TOKEN_TTL_MS + 1);
    expect((await (await handle()(request(undefined, expiring.token))).json()).error.code).toBe(
      "SESSION_ENDED",
    );
  });
  it.each(["revoke", "expire", "revision"])(
    "revalidates %s after a pending body, before query execution",
    async (change) => {
      vi.useFakeTimers();
      const save = saves.create();
      const cap = issue(save.id);
      if (change === "expire") await vi.advanceTimersByTimeAsync(QUERY_TOKEN_TTL_MS - 1000);
      const run = vi.fn(() => ({ columns: [], rows: [], total: 0, source: "test" }));
      const h = createQueryHandler({ run, track: () => {} });
      let body!: ReadableStreamDefaultController<Uint8Array>;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          body = controller;
        },
      });
      const pending = h(
        new Request(target, {
          method: "POST",
          headers: { authorization: "Bearer " + cap.token, "content-type": "application/json" },
          body: stream,
          duplex: "half",
        } as RequestInit),
      );
      if (change === "revoke") cap.revoke();
      if (change === "expire") await vi.advanceTimersByTimeAsync(1001);
      if (change === "revision") play(save.id);
      body.enqueue(new TextEncoder().encode(JSON.stringify(query)));
      body.close();
      const response = await pending;
      expect(response.status).toBe(401);
      expect((await response.json()).error.code).toBe("SESSION_ENDED");
      expect(run).not.toHaveBeenCalled();
    },
  );
  it("bounds issuance, never logs capabilities, and rejects request-controlled saves/views", async () => {
    const save = saves.create();
    const caps = Array.from({ length: 4 }, () => issue(save.id));
    expect(() => issueGameQueryToken(save.id)).toThrow("Too many active");
    caps[0].revoke();
    const fresh = issue(save.id);
    for (const extra of [{ view: {} }, { saveId: save.id }, { seed: 42 }]) {
      expect((await handle()(request(undefined, fresh.token, { ...query, ...extra }))).status).toBe(
        400,
      );
    }
    const events = JSON.stringify(vi.mocked(trackServer).mock.calls);
    expect(events).not.toContain(save.id);
    expect(events).not.toContain(fresh.token);
  });
  it("rejects nonlocal and cross-origin browser requests with the shared boundary", () => {
    expect(isLocalBrowserRequest(request())).toBe(true);
    expect(
      isLocalBrowserRequest(new Request(target, { headers: { origin: "http://evil.invalid" } })),
    ).toBe(false);
    expect(
      isLocalBrowserRequest(
        new Request("http://evil.invalid/api/query", {
          headers: { origin: "http://evil.invalid" },
        }),
      ),
    ).toBe(false);
  });
});

describe("a deployed visitor's Share play data choice on Dewey's lookups (Audit and Probe, #368)", () => {
  it("is carried on the token, so a lookup with no browser cookie still honours it", async () => {
    const { withSharing, visitorAllowsSharing } =
      await import("../platform/analytics/visitor-sharing.server");
    const { queryTokenSharing } = await import("./query-token.server");
    const save = saves.create();
    const off = withSharing(false, () => issue(save.id)).token;
    const on = issue(save.id).token;
    expect(queryTokenSharing(off)).toBe(false);
    expect(queryTokenSharing(on)).toBe(true);
    // The lookup itself runs with the token's choice: the query handler's events see it.
    const seen: boolean[] = [];
    const h = createQueryHandler({
      run: () => {
        seen.push(visitorAllowsSharing());
        return { columns: [], rows: [], total: null, source: "test" };
      },
      track: () => {},
    });
    await h(request(undefined, off));
    await h(request(undefined, on));
    expect(seen).toEqual([false, true]);
    // A refused lookup's failure event follows the token's choice too (Probe, #368).
    const failed: boolean[] = [];
    const refusing = createQueryHandler({
      track: (event) => event === "query_request_failed" && failed.push(visitorAllowsSharing()),
    });
    expect((await refusing(request(undefined, off, { measure: "nonsense", by: [] }))).status).toBe(
      400,
    );
    expect((await refusing(request(undefined, on, { measure: "nonsense", by: [] }))).status).toBe(
      400,
    );
    expect(failed).toEqual([false, true]);
  });
});
