import { describe, expect, it } from "vitest";
import { MAX_PLAN_BODY, PlanRefused, readPlan } from "./read-plan.server";

const URL_ = "http://localhost:5173/decide";

function post(body: BodyInit, headers: Record<string, string> = {}) {
  return new Request(URL_, {
    method: "POST",
    body,
    headers: { origin: "http://localhost:5173", "content-type": "application/x-www-form-urlencoded", ...headers },
  });
}

async function status(request: Request, deadlineMs?: number) {
  try {
    await readPlan(request, deadlineMs);
    return 200;
  } catch (error) {
    return (error as PlanRefused).status;
  }
}

describe("readPlan", () => {
  it("reads one option", async () => {
    expect(await readPlan(post("option=C"))).toBe("C");
  });

  // Audit's case: a 1 MB form with an unused field was accepted and committed.
  it("refuses an oversized body, whatever it declares", async () => {
    expect(await status(post(`option=A&unused=${"x".repeat(1_000_000)}`))).toBe(413);
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(`option=A&pad=${"x".repeat(MAX_PLAN_BODY)}`));
        c.close();
      },
    });
    expect(await status(new Request(URL_, { method: "POST", body: stream, duplex: "half", headers: { origin: "http://localhost:5173", "content-type": "application/x-www-form-urlencoded" } } as RequestInit))).toBe(413);
  });

  it("refuses unknown or repeated fields and unknown options", async () => {
    expect(await status(post("option=A&unused=1"))).toBe(400);
    expect(await status(post("option=A&option=B"))).toBe(400);
    expect(await status(post("option=E"))).toBe(400);
    expect(await status(post(""))).toBe(400);
  });

  it("refuses other sites and other content types", async () => {
    expect(await status(post("option=A", { origin: "https://elsewhere.example" }))).toBe(403);
    expect(await status(post("option=A", { "sec-fetch-site": "cross-site" }))).toBe(403);
    expect(await status(post('{"option":"A"}', { "content-type": "application/json" }))).toBe(415);
  });

  it("gives up on a body that never finishes", async () => {
    const stalled = new ReadableStream({ start() {} });
    const request = new Request(URL_, { method: "POST", body: stalled, duplex: "half", headers: { origin: "http://localhost:5173", "content-type": "application/x-www-form-urlencoded" } } as RequestInit);
    expect(await status(request, 50)).toBe(408);
  });
});
