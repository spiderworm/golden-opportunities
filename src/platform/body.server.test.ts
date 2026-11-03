// The capped reader at the public actions' doors (Audit and Goldy, 3 Nov 2026), and the actions that use it.
import { describe, expect, it, vi } from "vitest";
vi.mock("~/platform/analytics/analytics.server", () => ({ trackServer: vi.fn() }));
import { BodyRefused, readCappedForm, readCappedText } from "./body.server";
import { action as entryAction, MAX_ENTRY_BODY } from "../entry/route";
import { action as reportsAction, MAX_REPORTS_BODY } from "../reports/route";
import type { Route as EntryRoute } from "../entry/+types/route";
import type { Route as ReportsRoute } from "../reports/+types/route";

const FORM = { "content-type": "application/x-www-form-urlencoded" };

/** A body sent `chunks` KB at a time, every `everyMs`, until it closes: a slow or endless upload. */
function trickle(chunks: number, everyMs = 0) {
  let sent = 0;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (everyMs) await new Promise((r) => setTimeout(r, everyMs));
      if (sent++ >= chunks) return controller.close();
      controller.enqueue(new TextEncoder().encode("a".repeat(1024)));
    },
  });
  return { stream, sent: () => sent };
}

const post = (body: BodyInit, headers: Record<string, string> = FORM, url = "http://localhost/x") =>
  new Request(url, { method: "POST", headers, body, duplex: "half" } as RequestInit);

async function refusal(read: Promise<unknown>) {
  try {
    await read;
    return "read";
  } catch (error) {
    return error instanceof BodyRefused ? error.status : String(error);
  }
}

describe("readCappedText", () => {
  it("reads a body within the cap", async () => {
    expect(await readCappedText(post("agree=yes"), 64)).toBe("agree=yes");
    expect(await readCappedText(new Request("http://localhost/x", { method: "POST" }), 64)).toBe(
      "",
    );
  });

  it("refuses a declared length past the cap before reading a byte", async () => {
    const { stream, sent } = trickle(1000);
    const request = post(stream, { ...FORM, "content-length": String(1_000_000) });
    expect(await refusal(readCappedText(request, 4096))).toBe(413);
    // A stream fills its first chunk as it's made; nothing more was pulled.
    expect(sent()).toBeLessThanOrEqual(1);
    expect(await refusal(readCappedText(post("x", { "content-length": "12abc" }), 4096))).toBe(413);
  });

  it("stops reading once a body passes the cap, whatever it declared", async () => {
    const { stream, sent } = trickle(10_000);
    expect(await refusal(readCappedText(post(stream), 4096))).toBe(413);
    // The cap is 4 KB: it stopped within a chunk or two of it, not at 10 MB.
    expect(sent()).toBeLessThan(10);
  });

  it("gives up on a slow body at the deadline", async () => {
    const { stream } = trickle(1000, 50);
    const started = performance.now();
    expect(await refusal(readCappedText(post(stream), 1_000_000, 200))).toBe(408);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it("refuses a body that isn't UTF-8", async () => {
    expect(await refusal(readCappedText(post(new Uint8Array([0xff, 0xfe])), 64))).toBe(400);
  });
});

describe("readCappedForm", () => {
  it("reads form fields, and refuses any other type", async () => {
    expect((await readCappedForm(post("agree=yes&to=%2F"), 64)).get("to")).toBe("/");
    const multipart = new FormData();
    multipart.set("agree", "yes");
    expect(await refusal(readCappedForm(post(multipart, {}), 4096))).toBe(415);
    expect(
      await refusal(readCappedForm(post("{}", { "content-type": "application/json" }), 64)),
    ).toBe(415);
  });
});

describe("the public actions read through it", () => {
  it("the entry action answers an oversized or slow body with its status, setting no cookie", async () => {
    const big = await entryAction({
      request: post(`agree=yes&to=${"a".repeat(MAX_ENTRY_BODY)}`, FORM, "http://localhost/entry"),
    } as EntryRoute.ActionArgs);
    expect(big.status).toBe(413);
    expect(big.headers.get("Set-Cookie")).toBeNull();
    const { stream, sent } = trickle(100_000);
    const endless = await entryAction({
      request: post(stream, FORM, "http://localhost/entry"),
    } as EntryRoute.ActionArgs);
    expect(endless.status).toBe(413);
    expect(sent()).toBeLessThan(10);
    // A real entry is well inside.
    const ok = await entryAction({
      request: post("agree=yes&music=on&to=%2Fstation", FORM, "http://localhost/entry"),
    } as EntryRoute.ActionArgs);
    expect(ok.status).toBe(303);
  });

  it("the reports action answers an oversized body as a refusal, before it reads the save", async () => {
    const big = (await reportsAction({
      request: post(
        `intent=create&report=${"a".repeat(MAX_REPORTS_BODY)}`,
        FORM,
        "http://localhost/reports",
      ),
    } as ReportsRoute.ActionArgs)) as unknown as { data: unknown; init: { status: number } };
    expect(big).toMatchObject({ data: { ok: false, reason: "invalid" }, init: { status: 413 } });
  });
});
