import { afterEach, describe, expect, it } from "vitest";
import { acquire, fakeAssistant, getAssistant, ndjson, resetLimitsForTests, setAssistantForTests } from "./assistant.server.ts";
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
  it("allows one answer at a time, and at most 60 an hour", () => {
    const release = acquire(0);
    expect(typeof release).toBe("function");
    expect(acquire(1)).toBe("busy");
    (release as () => void)();
    for (let i = 1; i < 60; i++) (acquire(i) as () => void)();
    expect(acquire(100)).toBe("limit");
    expect(typeof acquire(3600_001)).toBe("function");
  });

  it("releasing twice doesn't free a slot someone else holds", () => {
    const first = acquire(0) as () => void;
    first();
    const second = acquire(1);
    first();
    expect(acquire(2)).toBe("busy");
    (second as () => void)();
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
