import { afterEach, describe, expect, it, vi } from "vitest";
import { DATA_VERSION_HEADER, queryCache } from "~/platform/query-cache.client";
import { EVIDENCE_HEADER, type Query } from "~/query/types";
import { fetchQuery } from "./query-client";

const query: Query = { measure: "revenue", by: ["weekday", "month"] };
const answer = { columns: [], rows: [], total: 0, source: "Sales" };

describe("a query that is context, never evidence (Plot, #266)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("tells the server not to record it, and is kept apart from the same query shown as evidence", async () => {
    queryCache.setVersion("v-context");
    const sent: (string | null)[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      sent.push(new Headers(init.headers).get(EVIDENCE_HEADER));
      return new Response(JSON.stringify(answer), { headers: { [DATA_VERSION_HEADER]: "v-context" } });
    });
    await fetchQuery(query, undefined, { evidence: false });
    // The same query as evidence (a table or chart pin) still asks the server, which records it.
    await fetchQuery(query);
    // Each is cached under its own kind: neither asks again.
    await fetchQuery(query, undefined, { evidence: false });
    await fetchQuery(query);
    expect(sent).toEqual(["none", null]);
  });
});
