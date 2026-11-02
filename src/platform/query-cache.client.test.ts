import { describe, expect, it, vi } from "vitest";

import type { Query } from "~/query/types";
import { createQueryCache, flushQueryCacheStats, pageOf, queryKey, type Loaded } from "./query-cache.client";

/** A request the test answers by hand. */
function deferred<T>() {
  let resolve!: (value: Loaded<T>) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<Loaded<T>>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
const answer = <T>(value: T, bytes = 10) => () => Promise.resolve({ value, bytes });

describe("the query cache", () => {
  it("answers a repeat from memory, for the same data version", async () => {
    const cache = createQueryCache();
    cache.setVersion("v1");
    const fetcher = vi.fn(answer({ rows: [1] }));
    const first = await cache.load("a", fetcher);
    expect(await cache.load("a", fetcher)).toBe(first);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(cache.takeStats()).toMatchObject({ hits: 1, misses: 1, bytesServed: 10 });
    expect(cache.takeStats()).toMatchObject({ hits: 0, misses: 0 });
  });

  it("never serves an answer from another data version: a plan commit, a reset or a new game", async () => {
    const cache = createQueryCache();
    cache.setVersion("v1");
    await cache.load("a", answer("Q1's ledgers"));
    cache.setVersion("v2");
    expect(cache.size.entries).toBe(0);
    expect(await cache.load("a", answer("Q2's ledgers"))).toBe("Q2's ledgers");
    // Setting the same version again keeps what's there.
    cache.setVersion("v2");
    expect(cache.peek("a")).toBe("Q2's ledgers");
  });

  it("doesn't keep an answer that arrives after the version changed", async () => {
    const cache = createQueryCache();
    cache.setVersion("v1");
    const late = deferred<string>();
    const asked = cache.load("a", () => late.promise);
    cache.setVersion("v2");
    late.resolve({ value: "Q1's ledgers", bytes: 10 });
    expect(await asked).toBe("Q1's ledgers");
    expect(cache.peek("a")).toBeUndefined();
    // And a request after the change doesn't join the old one.
    const fetcher = vi.fn(answer("Q2's ledgers"));
    expect(await cache.load("a", fetcher)).toBe("Q2's ledgers");
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("files an answer only under the version the server computed it for (Frank, #187)", async () => {
    const cache = createQueryCache();
    cache.setVersion("v1");
    // No version from the server: not kept.
    await cache.load("b", () => Promise.resolve({ value: "rows", bytes: 5, version: null }));
    expect(cache.peek("b")).toBeUndefined();
    await cache.load("c", () => Promise.resolve({ value: "rows", bytes: 5, version: "v1" }));
    expect(cache.peek("c")).toBe("rows");
    // Asked under v1 but computed after a commit (v2): passed on, not kept under either; the page moves to v2.
    expect(await cache.load("a", () => Promise.resolve({ value: "Q2's rows", bytes: 5, version: "v2" }))).toBe("Q2's rows");
    expect(cache.peek("a")).toBeUndefined();
    expect(cache.version).toBe("v2");
  });

  it("moves to a newer version an answer names, and tells the shell, so an overtaken tab catches up (Frank and Audit, #191)", async () => {
    const cache = createQueryCache();
    const stale = vi.fn();
    cache.onStale(stale);
    cache.setVersion("v1");
    await cache.load("a", () => Promise.resolve({ value: "Q1's rows", bytes: 5, version: "v1" }));
    // Another tab committed Q2: this page's next answer is computed under v2.
    expect(await cache.load("b", () => Promise.resolve({ value: "Q2's rows", bytes: 5, version: "v2" }))).toBe("Q2's rows");
    expect(stale).toHaveBeenCalledOnce();
    expect(cache.version).toBe("v2");
    // Q1's answer is never served again; the next ask goes to the server, and is kept under v2.
    expect(cache.peek("a")).toBeUndefined();
    expect(await cache.load("a", () => Promise.resolve({ value: "Q2's rows for a", bytes: 5, version: "v2" }))).toBe("Q2's rows for a");
    expect(cache.peek("a")).toBe("Q2's rows for a");
    // The shell renders again with its old data before revalidating: v1 doesn't come back.
    cache.setVersion("v1");
    expect(cache.version).toBe("v2");
    // Nor does a late answer computed before the commit.
    await cache.load("late", () => Promise.resolve({ value: "Q1's rows", bytes: 5, version: "v1" }));
    expect(cache.version).toBe("v2");
    expect(cache.peek("late")).toBeUndefined();
    expect(stale).toHaveBeenCalledOnce();
    expect(cache.takeStats().overtaken).toBe(1);
  });

  it("never goes back to a version it has left after the shell moved on", async () => {
    const cache = createQueryCache();
    cache.setVersion("v1");
    const late = deferred<string>();
    const asked = cache.load("a", () => late.promise);
    cache.setVersion("v2"); // this tab committed the plan
    late.resolve({ value: "Q1's rows", bytes: 5, version: "v1" });
    await asked;
    expect(cache.version).toBe("v2");
  });

  it("keeps nothing before the version is known", async () => {
    const cache = createQueryCache();
    const fetcher = vi.fn(answer("rows"));
    await cache.load("a", fetcher);
    await cache.load("a", fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("shares one request between callers asking at once", async () => {
    const cache = createQueryCache();
    cache.setVersion("v1");
    const request = deferred<string>();
    const fetcher = vi.fn(() => request.promise);
    const both = [cache.load("a", fetcher), cache.load("a", fetcher)];
    request.resolve({ value: "rows", bytes: 4 });
    expect(await Promise.all(both)).toEqual(["rows", "rows"]);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(cache.takeStats()).toMatchObject({ misses: 1, shared: 1 });
  });

  it("lets one caller give up without cancelling the request the others share, which is still kept", async () => {
    const cache = createQueryCache();
    cache.setVersion("v1");
    const request = deferred<string>();
    const leaving = new AbortController();
    const gone = cache.load("a", () => request.promise, leaving.signal);
    const staying = cache.load("a", () => request.promise);
    leaving.abort();
    await expect(gone).rejects.toMatchObject({ name: "AbortError" });
    request.resolve({ value: "rows", bytes: 4 });
    expect(await staying).toBe("rows");
    expect(cache.peek("a")).toBe("rows");
    // A caller already aborted gets nothing, even from the cache.
    const aborted = AbortSignal.abort();
    await expect(cache.load("a", answer("rows"), aborted)).rejects.toMatchObject({ name: "AbortError" });
  });

  it("passes errors on and keeps none, so the next ask tries again", async () => {
    const cache = createQueryCache();
    cache.setVersion("v1");
    const failing = vi.fn(() => Promise.reject(new Error("RATE_LIMITED")));
    await expect(cache.load("a", failing)).rejects.toThrow("RATE_LIMITED");
    expect(await cache.load("a", answer("rows"))).toBe("rows");
    expect(failing).toHaveBeenCalledOnce();
  });

  it("stays within its entries and bytes, dropping the least recently used", async () => {
    const cache = createQueryCache({ maxEntries: 2, maxBytes: 100 });
    cache.setVersion("v1");
    await cache.load("a", answer("A", 10));
    await cache.load("b", answer("B", 10));
    cache.peek("a"); // a is now the most recently used
    await cache.load("c", answer("C", 10));
    expect(cache.peek("b")).toBeUndefined();
    expect(cache.peek("a")).toBe("A");
    expect(cache.size).toEqual({ entries: 2, bytes: 20 });
    await cache.load("d", answer("D", 95));
    expect(cache.size).toEqual({ entries: 1, bytes: 95 });
    // Something bigger than the whole cache is passed on, not kept.
    expect(await cache.load("e", answer("E", 101))).toBe("E");
    expect(cache.peek("e")).toBeUndefined();
    expect(cache.takeStats().evictions).toBe(3);
  });

  it("keeps a value fetched elsewhere only for the version it was fetched under", () => {
    const cache = createQueryCache();
    cache.setVersion("v2");
    cache.put("view", "old", 5, "v1");
    expect(cache.peek("view")).toBeUndefined();
    cache.put("view", "new", 5, "v2");
    expect(cache.peek("view")).toBe("new");
  });
});

describe("a query's key", () => {
  it("is the same whatever order the filters and their values come in, but keeps the grouping's order", () => {
    const a: Query = { measure: "units", by: ["genre", "quarter"], filter: { quarter: ["2193-Q1", "2193-Q2"], format: ["Hardcover"] } };
    const b: Query = { measure: "units", by: ["genre", "quarter"], filter: { format: ["Hardcover"], quarter: ["2193-Q2", "2193-Q1"] } };
    expect(queryKey(a)).toBe(queryKey(b));
    expect(queryKey({ ...a, by: ["quarter", "genre"] })).not.toBe(queryKey(a));
    expect(queryKey({ ...a, limit: 5 })).not.toBe(queryKey(a));
    expect(queryKey({ measure: "units", by: [] })).not.toBe(queryKey({ measure: "revenue", by: [] }));
  });
});

describe("the data version header", () => {
  it("is the one the query endpoint sends", async () => {
    const { DATA_VERSION_HEADER: server } = await import("~/query/data-version.server");
    const { DATA_VERSION_HEADER: client } = await import("./query-cache.client");
    expect(client).toBe(server);
  });
});

describe("the page's cache summary", () => {
  it("is one event per page view, with counts only, and none for a page that asked nothing", async () => {
    const cache = createQueryCache();
    cache.setVersion("v1");
    const track = vi.fn();
    flushQueryCacheStats(cache, track, "station");
    expect(track).not.toHaveBeenCalled();
    await cache.load("a", answer("rows", 7));
    await cache.load("a", answer("rows", 7));
    flushQueryCacheStats(cache, track, pageOf("/investigate"));
    expect(track).toHaveBeenCalledOnce();
    expect(track).toHaveBeenCalledWith("query_cache_summary", { page: "investigate", hits: 1, misses: 1, shared: 0, bytesServed: 7, evictions: 0, overtaken: 0, entries: 1 });
    expect(pageOf("/")).toBe("station");
    expect(pageOf("/result")).toBe("result");
    expect(pageOf("/reports/a-players-title")).toBe("other");
  });
});
