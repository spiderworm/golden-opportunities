import { afterEach, describe, expect, it, vi } from "vitest";
import { runPin } from "./PinnedCharts";
import { QueryRequestError } from "./query-client";
import type { Pin } from "./spec";

const comparison: Pin = { id: "c", pinnedBy: "player", title: "Revenue compared across quarter", kind: "comparison", comparison: { measure: "revenue", across: "quarter", from: "2193-Q3", to: "2193-Q4", by: [] } };
const side = (quarter: string, revenue: number) => ({ columns: [{ key: "quarter", label: "Quarter", type: "string", nullable: false }, { key: "revenue", label: "Revenue", type: "number", nullable: false }], rows: [{ quarter, revenue }], total: revenue, source: `Sales, ${quarter}` });

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
    expect(loaded).toMatchObject({ kind: "comparison", result: { labels: { from: "2193-Q3", to: "2193-Q4" }, total: { from: 200, to: 150, change: -50, direction: "fell" } } });
  });

  it("fails as a whole when either side fails, and cancels the other", async () => {
    let cancelled = false;
    vi.stubGlobal("fetch", (_url: string, init: RequestInit) => {
      const quarter = JSON.parse(init.body as string).filter.quarter[0];
      if (quarter === "2193-Q4") return Promise.resolve(new Response(JSON.stringify({ error: { code: "SESSION_ENDED", message: "Ended." } }), { status: 401 }));
      return new Promise((_resolve, reject) => {
        init.signal!.addEventListener("abort", () => {
          cancelled = true;
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    });
    await expect(runPin(comparison, new AbortController().signal)).rejects.toEqual(new QueryRequestError("SESSION_ENDED", "Ended."));
    expect(cancelled).toBe(true);
  });

  it("cancels both sides when the card goes away", async () => {
    const signals: AbortSignal[] = [];
    vi.stubGlobal("fetch", (_url: string, init: RequestInit) => {
      signals.push(init.signal!);
      return new Promise((_resolve, reject) => init.signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))));
    });
    const card = new AbortController();
    const running = runPin(comparison, card.signal);
    card.abort();
    await expect(running).rejects.toThrow();
    expect(signals.map((s) => s.aborted)).toEqual([true, true]);
  });
});
