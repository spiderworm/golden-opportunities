// The deployed origin (David, 3 Nov 2026: "We do need to deploy this to AWS, actually. Today."). Behind Caddy the
// app sees http://<host>/… with the browser's Host, and an Origin of https://<host>. Each gate takes that one
// origin exactly, and nothing near it; unset, each behaves as it always did.
import { afterEach, describe, expect, it, vi } from "vitest";

// Each test imports the gates afresh, with the setting as given: a cold import of them all takes a few seconds.
vi.setConfig({ testTimeout: 60_000 });

const PUBLIC = "https://21pqa9rxuayp.tellimgames.com";
const HOST = "21pqa9rxuayp.tellimgames.com";

/** The modules with ORBITAL_PUBLIC_ORIGIN as given, read at start-up as the server reads it. */
async function withOrigin(value: string | undefined) {
  vi.resetModules();
  if (value === undefined) vi.stubEnv("ORBITAL_PUBLIC_ORIGIN", "");
  else vi.stubEnv("ORBITAL_PUBLIC_ORIGIN", value);
  return {
    origin: await import("./origin.server"),
    access: await import("../query/access.server"),
    ask: await import("../assistant/server/ask.server"),
    sharing: await import("./analytics/sharing.server"),
    plan: await import("../decide/read-plan.server"),
  };
}
afterEach(() => vi.unstubAllEnvs());

/** A browser request as the proxy forwards it: http to the app, the browser's Host and Origin. */
const proxied = (
  headers: Record<string, string>,
  { path = "/api/query", host = HOST, method = "POST" } = {},
) => new Request(`http://${host}${path}`, { method, headers });
const good = { origin: PUBLIC, "sec-fetch-site": "same-origin" };

/** Every way a request near the deployed origin must still be refused. */
const refused: [string, Record<string, string>, { host?: string }?][] = [
  ["another site's Origin", { origin: "https://evil.example", "sec-fetch-site": "cross-site" }],
  ["the right Origin, sent cross-site", { origin: PUBLIC, "sec-fetch-site": "cross-site" }],
  [
    "the right Origin, same-site but not same-origin",
    { origin: PUBLIC, "sec-fetch-site": "same-site" },
  ],
  ["http for https", { origin: `http://${HOST}` }],
  ["another port", { origin: `${PUBLIC}:8443` }],
  ["a look-alike host", { origin: `https://${HOST}.evil.example` }],
  ["a look-alike prefix", { origin: `https://x${HOST}` }],
  ["a trailing slash", { origin: `${PUBLIC}/` }],
  ["no Origin", {}],
  ["the right Origin for another Host", good, { host: "other.example" }],
  ["the right Origin for a loopback Host", good, { host: "127.0.0.1:3000" }],
];

describe("ORBITAL_PUBLIC_ORIGIN, read at start-up", () => {
  it("takes an https origin and nothing more, and fails loudly on anything else", async () => {
    const { origin } = await withOrigin(undefined);
    expect(origin.parsePublicOrigin(undefined)).toBeNull();
    expect(origin.parsePublicOrigin("")).toBeNull();
    expect(origin.parsePublicOrigin(PUBLIC)).toBe(PUBLIC);
    for (const bad of [
      `http://${HOST}`,
      `${PUBLIC}/`,
      `${PUBLIC}/play`,
      `${PUBLIC}?a=1`,
      `${PUBLIC}#x`,
      `https://user:pass@${HOST}`,
      HOST,
      "not a url",
    ])
      expect(() => origin.parsePublicOrigin(bad), bad).toThrow(/ORBITAL_PUBLIC_ORIGIN/);
  });

  it("stops the server from starting when it's set wrong", async () => {
    await expect(withOrigin(`http://${HOST}`)).rejects.toThrow(/ORBITAL_PUBLIC_ORIGIN/);
  });
});

describe("the gates, with the deployed origin set", () => {
  it("each lets the deployed page in", async () => {
    const { access, ask, sharing, plan } = await withOrigin(PUBLIC);
    expect(access.isLocalBrowserRequest(proxied(good))).toBe(true);
    expect(() =>
      ask.checkDoor(proxied({ ...good, "content-type": "application/json" })),
    ).not.toThrow();
    const share = await sharing.setSharingFromRequest(
      new Request(`http://${HOST}/api/sharing`, {
        method: "POST",
        headers: { ...good, "content-type": "application/json" },
        body: JSON.stringify({ on: false }),
      }),
      () => {},
    );
    expect(share.status).toBe(200);
    // The plan form gets past the origin check (and is then refused only for its content).
    const form = new Request(`http://${HOST}/decide`, {
      method: "POST",
      headers: { ...good, "content-type": "application/x-www-form-urlencoded" },
      body: "levers=sale",
    });
    await expect(plan.readPlan(form)).resolves.toBeTruthy();
  });

  it("each refuses everything near it", async () => {
    const { access, ask, sharing, plan } = await withOrigin(PUBLIC);
    sharing.resetAdmission();
    for (const [why, headers, at] of refused) {
      const request = () => proxied(headers, at);
      expect(access.isLocalBrowserRequest(request()), why).toBe(false);
      expect(
        () => ask.checkDoor(proxied({ ...headers, "content-type": "application/json" }, at)),
        why,
      ).toThrow(/Same-origin/);
      const share = await sharing.setSharingFromRequest(
        new Request(`http://${at?.host ?? HOST}/api/sharing`, {
          method: "POST",
          headers: { ...headers, "content-type": "application/json" },
          body: JSON.stringify({ on: false }),
        }),
        () => {},
      );
      expect(share.status, why).toBe(403);
      const form = new Request(`http://${at?.host ?? HOST}/decide`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/x-www-form-urlencoded" },
        body: "levers=sale",
      });
      await expect(plan.readPlan(form), why).rejects.toThrow(/Same-origin/);
    }
  });

  it("still lets a page on this machine in, as before", async () => {
    const { access } = await withOrigin(PUBLIC);
    const local = new Request("http://127.0.0.1:5173/api/query", {
      method: "POST",
      headers: { origin: "http://127.0.0.1:5173", "sec-fetch-site": "same-origin" },
    });
    expect(access.isLocalBrowserRequest(local)).toBe(true);
  });

  it("marks cookies Secure for the deployed host, which the proxy served over https", async () => {
    const { origin } = await withOrigin(PUBLIC);
    expect(origin.servedOverHttps(proxied(good, { path: "/" }))).toBe(true);
    expect(origin.servedOverHttps(new Request("http://127.0.0.1:5173/"))).toBe(false);
    expect(origin.servedOverHttps(new Request("https://127.0.0.1:5173/"))).toBe(true);
  });
});

describe("the gates, with it unset", () => {
  it("refuse the deployed page, as they always would", async () => {
    const { access, ask, origin } = await withOrigin(undefined);
    expect(origin.PUBLIC_ORIGIN).toBeNull();
    expect(access.isLocalBrowserRequest(proxied(good))).toBe(false);
    expect(() => ask.checkDoor(proxied({ ...good, "content-type": "application/json" }))).toThrow(
      /Same-origin/,
    );
    expect(origin.servedOverHttps(proxied(good, { path: "/" }))).toBe(false);
  });
});
