import { beforeEach, describe, expect, it, vi } from "vitest";

const { trackServer } = vi.hoisted(() => ({ trackServer: vi.fn() }));
vi.mock("~/platform/analytics/analytics.server", () => ({ trackServer }));
import { ENTRY_COPY } from "./copy";
import { ENTRY_COOKIE, ENTRY_VERSION, MUSIC_COOKIE } from "./cookie";
import { entryGate, safeReturn } from "./gate.server";
import { action } from "./route";

const BASE = "http://127.0.0.1:5173";
const AGREED = `${ENTRY_COOKIE}=${ENTRY_VERSION}`;
const PAGE = { "Sec-Fetch-Dest": "document", Accept: "text/html" };

type GateArgs = Parameters<typeof entryGate>[0];
async function gate(path: string, init: RequestInit = {}) {
  const next = vi.fn(async () => new Response("the app"));
  const request = new Request(`${BASE}${path}`, init);
  let response: Response;
  try {
    response = (await entryGate({ request } as GateArgs, next)) as Response;
  } catch (thrown) {
    response = thrown as Response;
  }
  return { response, next };
}

function post(form: Record<string, string>) {
  return new Request(`${BASE}/entry`, { method: "POST", body: new URLSearchParams(form) });
}

beforeEach(() => trackServer.mockClear());

describe("the entry gate", () => {
  it("shows the entry page at any URL, before the app runs anything", async () => {
    const { response, next } = await gate("/investigate?quarter=2194-Q1", { headers: PAGE });
    expect(next).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/html");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    const html = await response.text();
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain(ENTRY_COPY.heading);
    expect(html).toContain('action="/entry"');
    expect(html).toContain('name="to" value="/investigate?quarter=2194-Q1"');
    // No chrome, no music, no app: none of the app's scripts or stylesheets are on it.
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html).not.toContain("/assets/");
    expect(trackServer).toHaveBeenCalledWith("entry_shown", {});
  });

  it("starts with Play the music ticked and Continue off until the agreement is", async () => {
    const html = await (await gate("/", { headers: PAGE })).response.text();
    expect(html).toContain('<input type="checkbox" name="music" checked="" value="on"/>');
    expect(html).toContain(
      '<input type="checkbox" id="agree" required="" name="agree" value="yes"/>',
    );
    expect(html).toMatch(/<button type="submit" id="continue" disabled=""/);
    expect(html).toContain('href="/privacy.html"');
  });

  it("lets the game through once the player has agreed, and marks every response not to be indexed", async () => {
    const { response, next } = await gate("/", { headers: { ...PAGE, Cookie: `x=1; ${AGREED}` } });
    expect(next).toHaveBeenCalledOnce();
    expect(await response.text()).toBe("the app");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  });

  it("asks again when the agreement's version has changed", async () => {
    const { response, next } = await gate("/", {
      headers: { ...PAGE, Cookie: `${ENTRY_COOKIE}=0` },
    });
    expect(next).not.toHaveBeenCalled();
    expect(await response.text()).toContain(ENTRY_COPY.heading);
  });

  it("reloads a page's data request, as the production build sends it, as the page itself", async () => {
    for (const [path, to] of [
      ["/decide.data", "/decide"],
      ["/_.data", "/"],
      [
        "/investigate.data?quarter=2194-Q1&_routes=routes%2Finvestigate",
        "/investigate?quarter=2194-Q1",
      ],
      ["//evil.example.data", "/evil.example"],
    ] as const) {
      const { response, next } = await gate(path, { headers: { "Sec-Fetch-Dest": "empty" } });
      expect(next).not.toHaveBeenCalled();
      expect(response.status).toBe(204);
      expect(response.headers.get("X-Remix-Redirect")).toBe(to);
      expect(response.headers.get("X-Remix-Reload-Document")).toBe("true");
    }
    // A form's post too, not a 403.
    const posted = await gate("/decide.data", { method: "POST", body: "levers=" });
    expect(posted.response.headers.get("X-Remix-Redirect")).toBe("/decide");
  });

  it("sends a page's data request to the page itself, which is the entry page", async () => {
    const { response, next } = await gate("/decide", { headers: { "Sec-Fetch-Dest": "empty" } });
    expect(next).not.toHaveBeenCalled();
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/decide");
    expect(response.headers.get("X-Remix-Reload-Document")).toBe("true");
  });

  it("shows the page to a client that sends no Sec-Fetch-Dest, rather than redirecting it to itself", async () => {
    const { response } = await gate("/?analytics-test=1");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain(ENTRY_COPY.heading);
    expect((await gate("/api/query")).response.status).toBe(403);
    expect(
      (await gate("/api/query", { headers: { "Sec-Fetch-Dest": "empty" } })).response.status,
    ).toBe(403);
  });

  it("refuses the app's other requests before the agreement", async () => {
    const { response, next } = await gate("/api/assistant", { method: "POST", body: "{}" });
    expect(next).not.toHaveBeenCalled();
    expect(response.status).toBe(403);
  });

  it("lets Continue through, and Dewey's tool server with its own token", async () => {
    expect((await gate("/entry", { method: "POST", body: "" })).next).toHaveBeenCalledOnce();
    const tool = await gate("/api/query", {
      method: "POST",
      body: "{}",
      headers: { Authorization: "Bearer token" },
    });
    expect(tool.next).toHaveBeenCalledOnce();
  });
});

describe("Continue", () => {
  it("with the agreement ticked: remembers it for a year and goes on to the page asked for", async () => {
    const response = await action({
      request: post({ agree: "yes", music: "on", to: "/reports" }),
    } as never);
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("/reports");
    const cookies = response.headers.getSetCookie();
    expect(cookies).toEqual([
      `${ENTRY_COOKIE}=${ENTRY_VERSION}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000`,
      `${MUSIC_COOKIE}=on; Path=/; SameSite=Lax; Max-Age=3600`,
    ]);
    expect(trackServer).toHaveBeenCalledWith("entry_accepted", { music: "on" });
  });

  it("with Play the music unticked: also leaves the one-time music choice for the player", async () => {
    const response = await action({ request: post({ agree: "yes", to: "/" }) } as never);
    const cookies = response.headers.getSetCookie();
    expect(cookies).toHaveLength(2);
    expect(cookies[1]).toBe(`${MUSIC_COOKIE}=off; Path=/; SameSite=Lax; Max-Age=3600`);
    expect(trackServer).toHaveBeenCalledWith("entry_accepted", { music: "off" });
  });

  it("never sends the player off the site, however the return path is written", async () => {
    const response = await action({
      request: post({ agree: "yes", music: "on", to: "/\t/evil.example" }),
    } as never);
    expect(response.headers.get("Location")).toBe("/");
  });

  it("without the agreement: the entry page again, and nothing remembered", async () => {
    const response = await action({ request: post({ music: "on", to: "/reports" }) } as never);
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(await response.text()).toContain('name="to" value="/reports"');
    expect(trackServer).not.toHaveBeenCalled();
  });

  it("goes back only to a page on this site", () => {
    expect(safeReturn("/investigate?quarter=2194-Q1")).toBe("/investigate?quarter=2194-Q1");
    expect(safeReturn("//evil.example/")).toBe("/");
    expect(safeReturn("/\\evil.example/")).toBe("/");
    expect(safeReturn("https://evil.example/")).toBe("/");
    expect(safeReturn("/entry")).toBe("/");
    expect(safeReturn("/entry?x=1")).toBe("/");
    expect(safeReturn(null)).toBe("/");
    // Browsers drop tabs and line breaks before resolving, so "/\t/evil.example" would be //evil.example (Chart).
    for (const control of ["\t", "\n", "\r", "\u0000", "\u007f"])
      expect(safeReturn(`/${control}/evil.example`)).toBe("/");
    expect(safeReturn("/a\\b")).toBe("/");
    // Encoded, it's only a path on this site.
    expect(safeReturn("/%09/evil.example")).toBe("/%09/evil.example");
    expect(safeReturn("/./reports?q=1")).toBe("/reports?q=1");
    expect(safeReturn("/decide.data")).toBe("/");
    // Paths that resolve to two or more leading slashes keep only one (Probe, #330).
    for (const dots of [
      "/.//evil.example",
      "/x/..//evil.example",
      "/%2e//evil.example",
      "/%2E%2E//evil.example",
      "/a/../..//evil.example",
    ])
      expect(safeReturn(dots)).toBe("/evil.example");
    expect(safeReturn("/.///evil.example?q=1")).toBe("/evil.example?q=1");
  });
});
