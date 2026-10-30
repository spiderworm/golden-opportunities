import { afterEach, describe, expect, it } from "vitest";
import { acquire, arrive, fakeAssistant, getAssistant, ndjson, resetLimitsForTests, setAssistantForTests } from "./assistant.server.ts";
import { emailRedactor, REDACTED } from "./redact.server.ts";

afterEach(() => {
  resetLimitsForTests();
  setAssistantForTests(null);
});

describe("choosing a provider", () => {
  it("never builds the real one under test, or when the fake is asked for", () => {
    const real = () => {
      throw new Error("spawned the real assistant");
    };
    expect(getAssistant(real).name).toBe("fake");
    expect(getAssistant(real, { ORBITAL_ASSISTANT_PROVIDER: "fake" }).name).toBe("fake");
    expect(getAssistant(() => fakeAssistant(), {}).name).toBe("fake");
    const mine = fakeAssistant();
    setAssistantForTests(mine);
    expect(getAssistant(real)).toBe(mine);
  });
});

describe("limits", () => {
  const slot = (s: ReturnType<typeof acquire>) => {
    if (typeof s === "string") throw new Error(`refused: ${s}`);
    return s;
  };

  it("allows one answer at a time, and at most 60 charged answers an hour", () => {
    const first = slot(acquire(0));
    expect(acquire(1)).toBe("busy");
    first.charge();
    first.release();
    // 2.1 s apart, so the per-minute cap never trips.
    for (let i = 1; i < 60; i++) {
      const s = slot(acquire(i * 2_100));
      s.charge();
      s.release();
    }
    expect(acquire(60 * 2_100)).toBe("limit");
    expect(typeof acquire(3600_001)).toBe("object");
  });

  it("doesn't count requests that were never charged (malformed ones) toward the hour", () => {
    for (let i = 0; i < 100; i++) slot(acquire(i * 2_100)).release();
    const s = slot(acquire(100 * 2_100));
    s.charge();
    s.release();
  });

  it("caps every request at 30 a minute, so a flood is bounded and ends within the minute", () => {
    for (let i = 0; i < 30; i++) expect(arrive(i)).toBe(true);
    expect(arrive(30)).toBe(false);
    expect(arrive(60_001)).toBe(true);
  });

  it("releasing twice doesn't free a slot someone else holds", () => {
    const first = slot(acquire(0));
    first.release();
    const second = slot(acquire(1));
    first.release();
    expect(acquire(2)).toBe("busy");
    second.release();
  });
});

describe("the stream to the browser", () => {
  it("is one JSON event per line, and ends with the error event if the source throws", async () => {
    const res = ndjson<{ type: string; text?: string; message?: string }>(
      async function* () {
        yield { type: "text", text: "a" };
        yield { type: "text", text: "b\nc" };
        throw new Error("boom");
      },
      (e) => ({ type: "error", message: (e as Error).message }),
    );
    expect(res.headers.get("content-type")).toMatch(/ndjson/);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const lines = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
    expect(lines).toEqual([{ type: "text", text: "a" }, { type: "text", text: "b\nc" }, { type: "error", message: "boom" }]);
  });

  it("aborts the source when the reader cancels or the request is aborted", async () => {
    let seen: AbortSignal | undefined;
    let finished = false;
    const source = async function* (signal: AbortSignal) {
      seen = signal;
      try {
        for (let i = 0; ; i++) yield i;
      } finally {
        finished = true;
      }
    };
    const res = ndjson(source, () => -1);
    const reader = res.body!.getReader();
    await reader.read();
    await reader.cancel();
    expect(seen?.aborted).toBe(true);
    expect(finished).toBe(true);

    const request = new AbortController();
    const res2 = ndjson(source, () => -1, new Request("http://x/", { signal: request.signal }));
    await res2.body!.getReader().read();
    request.abort();
    expect(seen?.aborted).toBe(true);
  });
});

describe("the fake assistant", () => {
  it("streams word by word and passes tool events through", async () => {
    const out = [];
    for await (const e of fakeAssistant([{ type: "text", text: "Two words" }, { type: "tool", name: "query", input: {}, output: "{}", isError: false }]).ask({ system: "", message: "" }, new AbortController().signal)) out.push(e);
    expect(out).toEqual([{ type: "text", text: "Two " }, { type: "text", text: "words" }, { type: "tool", name: "query", input: {}, output: "{}", isError: false }]);
  });
});

it("the redactor cuts any email address and holds back only the last word", () => {
  const r = emailRedactor();
  expect(r.push("Write to ")).toBe("Write to ");
  expect(r.push("someone@example")).toBe("");
  expect(r.push(".org today")).toBe(`${REDACTED} `);
  expect(r.flush()).toBe("today");
});
