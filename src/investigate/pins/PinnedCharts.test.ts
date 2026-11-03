import { afterEach, describe, expect, it, vi } from "vitest";
import { runPin } from "./PinnedCharts";
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
        id: "h",
        pinnedBy: "player",
        title: "Units sold by weekday and month",
        kind: "heatmap",
        query,
      },
      new AbortController().signal,
    );
    await runPin(
      { id: "t", pinnedBy: "player", title: "Units by weekday and month", kind: "table", query },
      new AbortController().signal,
    );
    expect(sent).toEqual([{ evidence: "none" }, { evidence: null }]);
  });
});
