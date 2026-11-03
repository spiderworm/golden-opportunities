import { beforeEach, expect, test } from "vitest";
import { resetAdmission, setSharingFromRequest } from "./sharing.server";

beforeEach(() => resetAdmission());

const URL_ = "http://localhost:5173/api/analytics/sharing";
const req = (body: string, headers: Record<string, string> = {}, method = "POST", url = URL_) =>
  new Request(url, {
    method,
    body: method === "POST" ? body : undefined,
    headers: { origin: "http://localhost:5173", "content-type": "application/json", ...headers },
  });

async function run(request: Request) {
  const applied: boolean[] = [];
  const answer = await setSharingFromRequest(request, (on) => applied.push(on));
  return { ...answer, applied };
}

test("a same-origin page on this machine can turn sharing off and on", async () => {
  expect(await run(req('{"on":false}'))).toEqual({
    status: 200,
    body: { on: false },
    applied: [false],
  });
  expect(await run(req('{"on":true}'))).toMatchObject({ status: 200, applied: [true] });
});

test("other sites are refused, including DNS-rebound ones and a spoofed Host", async () => {
  expect((await run(req('{"on":false}', { origin: "https://evil.example" }))).status).toBe(403);
  // DNS rebinding: the page's own origin isn't loopback, even though the request reaches 127.0.0.1.
  expect(
    (
      await run(
        req(
          '{"on":false}',
          { origin: "http://rebind.example:5173" },
          "POST",
          "http://rebind.example:5173/api/analytics/sharing",
        ),
      )
    ).status,
  ).toBe(403);
  expect((await run(req('{"on":false}', { origin: "" }))).status).toBe(403);
  const noOrigin = new Request(URL_, {
    method: "POST",
    body: '{"on":false}',
    headers: { "content-type": "application/json" },
  });
  expect((await run(noOrigin)).applied).toEqual([]);
});

test("anything but a small {on: boolean} body changes nothing", async () => {
  for (const body of ['{"on":"no"}', "[]", "null", '{"on":false,"x":1}', "not json"]) {
    const r = await run(req(body));
    expect(r.status).toBe(400);
    expect(r.applied).toEqual([]);
  }
  expect((await run(req(`{"on":false,"pad":"${"x".repeat(400)}"}`))).status).toBe(413);
  expect((await run(req('{"on":false}', { "content-type": "text/plain" }))).status).toBe(415);
  expect((await run(req("", {}, "GET"))).status).toBe(405);
});

test("a body that never finishes times out, and a flood is refused before its body is read", async () => {
  const stalled = new Request(URL_, {
    method: "POST",
    headers: { origin: "http://localhost:5173", "content-type": "application/json" },
    body: new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode('{"on":'));
      },
    }),
    // @ts-expect-error Node needs this for a streamed body
    duplex: "half",
  });
  expect((await run(stalled)).status).toBe(408);
  resetAdmission();
  for (let i = 0; i < 30; i++) expect((await run(req('{"on":true}'))).status).toBe(200);
  let pulled = false;
  const flood = new Request(URL_, {
    method: "POST",
    headers: { origin: "http://localhost:5173", "content-type": "application/json" },
    // highWaterMark 0: the stream is pulled only when someone reads it.
    body: new ReadableStream(
      {
        pull(c) {
          pulled = true;
          c.enqueue(new TextEncoder().encode('{"on":false}'));
          c.close();
        },
      },
      { highWaterMark: 0 },
    ),
    // @ts-expect-error Node needs this for a streamed body
    duplex: "half",
  });
  expect((await run(flood)).status).toBe(429);
  expect(pulled).toBe(false);
});

test("a declared length over the cap is refused without reading", async () => {
  expect((await run(req('{"on":false}', { "content-length": "9999" }))).status).toBe(413);
});
