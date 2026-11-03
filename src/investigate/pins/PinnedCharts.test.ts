import { afterEach, describe, expect, it, vi } from "vitest";
import { resolvedLine, runPin } from "./PinnedCharts";
import { queryCache } from "~/platform/query-cache.client";
import { QueryRequestError } from "./query-client";
import type { Pin } from "./spec";
import { EVIDENCE_HEADER } from "~/query/types";

const comparison: Pin = {
  id: "c",
  pinnedBy: "player",
  title: "Revenue compared across quarter",
  kind: "comparison",
  comparison: { measure: "revenue", across: "quarter", from: "2193-Q3", to: "2193-Q4", by: [] },
};
const side = (quarter: string, revenue: number) => ({
  columns: [
    { key: "quarter", label: "Quarter", type: "string", nullable: false },
    { key: "revenue", label: "Revenue", type: "number", nullable: false },
  ],
  rows: [{ quarter, revenue }],
  total: revenue,
  source: `Sales, ${quarter}`,
});

describe("running a pinned comparison", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("runs its two queries through /api/query and combines them as Dewey does, labelled from the data", async () => {
    const bodies: unknown[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      expect(url).toBe("/api/query");
      const query = JSON.parse(init.body as string);
      bodies.push(query);
      const quarter = query.filter.quarter[0];
      return new Response(JSON.stringify(side(quarter, quarter === "2193-Q3" ? 200 : 150)));
    });
    const loaded = await runPin(comparison, new AbortController().signal);
    expect(bodies).toEqual([
      { measure: "revenue", by: ["quarter"], filter: { quarter: ["2193-Q3"] } },
      { measure: "revenue", by: ["quarter"], filter: { quarter: ["2193-Q4"] } },
    ]);
    expect(loaded).toMatchObject({
      kind: "comparison",
      result: {
        labels: { from: "2193-Q3", to: "2193-Q4" },
        total: { from: 200, to: 150, change: -50, direction: "fell" },
      },
    });
  });

  it("fails as a whole when either side fails, without waiting for the other", async () => {
    queryCache.setVersion("fails");
    vi.stubGlobal("fetch", (_url: string, init: RequestInit) => {
      const quarter = JSON.parse(init.body as string).filter.quarter[0];
      if (quarter === "2193-Q4")
        return Promise.resolve(
          new Response(JSON.stringify({ error: { code: "SESSION_ENDED", message: "Ended." } }), {
            status: 401,
          }),
        );
      return new Promise(() => {});
    });
    await expect(runPin(comparison, new AbortController().signal)).rejects.toEqual(
      new QueryRequestError("SESSION_ENDED", "Ended."),
    );
  });

  it("stops waiting when the card goes away, but lets its requests finish for the cache (one caller never cancels a shared request)", async () => {
    queryCache.setVersion("v-card");
    const answers: ((response: Response) => void)[] = [];
    vi.stubGlobal("fetch", (_url: string, init: RequestInit) => {
      expect(init.signal).toBeUndefined();
      return new Promise<Response>((resolve) => answers.push(resolve));
    });
    const card = new AbortController();
    const running = runPin(comparison, card.signal);
    card.abort();
    await expect(running).rejects.toMatchObject({ name: "AbortError" });
    for (const [i, answer] of answers.entries()) {
      const quarter = i === 0 ? "2193-Q3" : "2193-Q4";
      answer(
        new Response(JSON.stringify(side(quarter, 100)), {
          headers: { "X-Orbital-Data-Version": "v-card" },
        }),
      );
    }
    await vi.waitFor(() => expect(queryCache.size.entries).toBe(2));
    // Shown again, the card asks nothing.
    vi.stubGlobal("fetch", () => {
      throw new Error("asked again");
    });
    expect(await runPin(comparison, new AbortController().signal)).toMatchObject({
      kind: "comparison",
    });
  });
});

describe("running a pinned heatmap", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("asks as context, never evidence, while a table of the same query is evidence (Plot, #63 and #266)", async () => {
    queryCache.setVersion("heatmap-evidence");
    const sent: { evidence: string | null }[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      sent.push({ evidence: new Headers(init.headers).get(EVIDENCE_HEADER) });
      return new Response(JSON.stringify(side("2193-Q4", 5)));
    });
    const query = { measure: "units" as const, by: ["weekday" as const, "month" as const] };
    await runPin(
      {
        title: "Units sold by weekday and month",
        kind: "heatmap",
        query,
      },
      new AbortController().signal,
    );
    await runPin(
      { title: "Units by weekday and month", kind: "table", query },
      new AbortController().signal,
    );
    expect(sent).toEqual([{ evidence: "none" }, { evidence: null }]);
  });
});

describe("running a pinned waterfall", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("runs each quarter's revenue, and units with the split, as context, never as discovery evidence", async () => {
    const sent: { query: { measure: string; filter: { quarter: string[] } }; context: boolean }[] =
      [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      const query = JSON.parse(init.body as string);
      sent.push({ query, context: new Headers(init.headers).get(EVIDENCE_HEADER) === "none" });
      const quarter = query.filter.quarter[0];
      return new Response(
        JSON.stringify({
          columns: [
            { key: "genre", label: "Genre", type: "string", nullable: true },
            { key: query.measure, label: query.measure, type: "number", nullable: false },
          ],
          rows: [{ genre: "Fiction", [query.measure]: quarter === "2193-Q4" ? 100 : 120 }],
          total: quarter === "2193-Q4" ? 100 : 120,
          source: `Sales, ${quarter}`,
        }),
      );
    });
    const pin: Pin = {
      id: "w",
      pinnedBy: "player",
      title: "What drove revenue's change, Q4 2193 to Q1 2194, by genre",
      kind: "waterfall",
      waterfall: { by: "genre", then: "2193-Q4", now: "2194-Q1", split: true },
    };
    queryCache.setVersion("v-waterfall");
    const loaded = await runPin(pin, new AbortController().signal);
    expect(loaded.kind).toBe("waterfall");
    expect(sent.map((s) => [s.query.measure, s.query.filter.quarter[0]]).sort()).toEqual([
      ["revenue", "2193-Q4"],
      ["revenue", "2194-Q1"],
      ["units", "2193-Q4"],
      ["units", "2194-Q1"],
    ]);
    expect(sent.every((s) => s.context)).toBe(true);
  });
});

describe("a pin's relative quarters (Plot, section 9)", () => {
  it("read as the quarters they are now, under the pin's title", () => {
    expect(resolvedLine({ latest: "2194-Q1" })).toBe("Latest quarter: Q1 2194");
    expect(resolvedLine({ "latest-1": "2193-Q4", latest: "2194-Q1" })).toBe(
      "Quarter before latest: Q4 2193 · Latest quarter: Q1 2194",
    );
    expect(resolvedLine({ "latest-4": null })).toBe("Same quarter, a year earlier");
  });
});

describe("a pinned waterfall made on Latest quarter (Plot, #379)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("asks for its relative quarters, and draws the quarters the server resolved them to", async () => {
    queryCache.setVersion("v-moving");
    const asked: string[] = [];
    const now: Record<string, string> = { latest: "2194-Q1", "latest-1": "2193-Q4" };
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      const token = JSON.parse(init.body as string).filter.quarter[0] as string;
      asked.push(token);
      return new Response(
        JSON.stringify({ ...side(now[token]!, 100), resolved: { [token]: now[token] } }),
      );
    });
    const loaded = await runPin(
      {
        title: "What drove revenue's change into the latest quarter, by genre",
        kind: "waterfall",
        waterfall: { by: "genre", then: "latest-1", now: "latest" },
      },
      new AbortController().signal,
    );
    expect(asked.sort()).toEqual(["latest", "latest-1"]);
    expect(loaded).toMatchObject({
      kind: "waterfall",
      rows: { then: "2193-Q4", now: "2194-Q1" },
      resolved: { latest: "2194-Q1", "latest-1": "2193-Q4" },
    });
    if (loaded.kind !== "waterfall") return;
    expect(resolvedLine(loaded.resolved!)).toBe(
      "Latest quarter: Q1 2194 · Quarter before latest: Q4 2193",
    );
  });
});
