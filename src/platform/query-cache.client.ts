// The browser's cache of query results (David, 2 Nov 2026: "Please do client-side first"). After Q1 every query
// is a full scan of the simulated sales on the server (55 to 115 ms each, Frank's measure), and a pinned board or a
// report re-asks the same questions on every visit. Results are kept in memory, keyed by the save's data version
// (the shell loader's, which changes on every plan commit, reset, new game and server restart, #187) and a
// canonical form of the request.
//
// - A different data version drops everything: nothing from another game or an earlier quarter is ever served.
// - An answer is kept only under the version the server computed it for (its X-Orbital-Data-Version), and only
//   while that is the page's version, so an answer that raced a plan commit is never filed under the new one.
// - An answer naming a newer version means the page has been overtaken (a plan committed in another tab): the
//   cache moves to that version at once, dropping everything, and the shell is told, so it revalidates and the
//   page shows the new data (Frank's and Audit's findings on #191). A version once left is never returned to, so
//   a late answer from before a commit can't take the page back.
// - Two callers asking the same thing at once share one request; one caller giving up never cancels it.
// - Only successes are kept. An error, or an answer that arrives after the version changed, is passed on, not kept.
// - Bounded by entries and by bytes, least recently used first out.
// - Nothing is persisted: a reload starts empty.
import type { Track } from "~/platform/analytics/track";
import type { Query } from "~/query/types";

export interface CacheStats {
  /** Answered from the cache. */
  hits: number;
  /** Sent to the server. */
  misses: number;
  /** Joined a request already on its way. */
  shared: number;
  /** Bytes answered from the cache. */
  bytesServed: number;
  /** Entries dropped to stay within bounds. */
  evictions: number;
  /** Times an answer showed the page's data was out of date (a plan committed in another tab). */
  overtaken: number;
}

export interface Loaded<T> {
  value: T;
  /** Its size, for the byte bound: the response's length is close enough. */
  bytes: number;
  /**
   * The data version the server computed it under. Kept only if this is the page's version; null means unknown,
   * and is never kept. Left out, the version the request was made under stands in.
   */
  version?: string | null;
}

interface Entry {
  value: unknown;
  bytes: number;
}

export interface QueryCache {
  /** The data version answers are for. A new one drops every entry; null (not known yet) keeps nothing. */
  setVersion(version: string | null): void;
  readonly version: string | null;
  /** The cached value, if there is one for the current version; counts a hit. */
  peek<T>(key: string): T | undefined;
  /** The cached value, or the shared request for it, or a new request through `fetcher`. */
  load<T>(key: string, fetcher: () => Promise<Loaded<T>>, signal?: AbortSignal): Promise<T>;
  /** Keeps a value fetched elsewhere (a loader's answer), for the version it was fetched under. */
  put(key: string, value: unknown, bytes: number, version: string | null): void;
  /**
   * Notes the version an answer names. One the page hasn't had means the data moved on: the cache moves to it,
   * dropping everything, and `onStale` listeners hear it. One the page has left is ignored.
   */
  noteVersion(answered: string | null | undefined): void;
  /** Called once each time the page is found to be overtaken. Returns a function that stops listening. */
  onStale(listener: () => void): () => void;
  /** Counts a request made elsewhere after `peek` missed, for the page's summary. */
  noteMiss(): void;
  /** The counts since the last call, then zero. */
  takeStats(): CacheStats;
  readonly size: { entries: number; bytes: number };
}

const NO_STATS: CacheStats = { hits: 0, misses: 0, shared: 0, bytesServed: 0, evictions: 0, overtaken: 0 };

function abortError(): Error {
  return new DOMException("The operation was aborted.", "AbortError");
}

/** The caller's view of a shared request: it rejects as soon as this caller's signal aborts, and only for them. */
function forCaller<T>(shared: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return shared;
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(abortError());
    signal.addEventListener("abort", abort, { once: true });
    shared.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

export function createQueryCache({ maxEntries = 300, maxBytes = 4_000_000 } = {}): QueryCache {
  let version: string | null = null;
  const entries = new Map<string, Entry>();
  const inFlight = new Map<string, Promise<unknown>>();
  let bytes = 0;
  let stats: CacheStats = { ...NO_STATS };
  const staleListeners = new Set<() => void>();
  // Versions the page has left. Data only moves forward, so none comes back: not from the shell rendering again
  // with its old data before it revalidates, nor from a late answer computed before a commit.
  const superseded = new Set<string>();

  const moveTo = (next: string | null) => {
    if (version !== null) superseded.add(version);
    version = next;
    entries.clear();
    inFlight.clear();
    bytes = 0;
  };

  const noteVersion = (answered: string | null | undefined) => {
    if (!answered || answered === version || superseded.has(answered)) return;
    const overtaken = version !== null;
    moveTo(answered);
    if (!overtaken) return;
    stats.overtaken++;
    for (const listener of staleListeners) listener();
  };

  const drop = (key: string) => {
    const entry = entries.get(key);
    if (!entry) return;
    entries.delete(key);
    bytes -= entry.bytes;
  };

  const keep = (key: string, value: unknown, size: number) => {
    if (size > maxBytes) return;
    drop(key);
    entries.set(key, { value, bytes: size });
    bytes += size;
    // A Map iterates in insertion order, and a hit re-inserts: the first key is the least recently used.
    for (const oldest of entries.keys()) {
      if (entries.size <= maxEntries && bytes <= maxBytes) break;
      drop(oldest);
      stats.evictions++;
    }
  };

  const peek = <T>(key: string): T | undefined => {
    if (version === null) return undefined;
    const entry = entries.get(key);
    if (!entry) return undefined;
    entries.delete(key);
    entries.set(key, entry);
    stats.hits++;
    stats.bytesServed += entry.bytes;
    return entry.value as T;
  };

  return {
    setVersion(next) {
      if (next === version || (next !== null && superseded.has(next))) return;
      moveTo(next);
    },
    get version() {
      return version;
    },
    peek,
    load<T>(key: string, fetcher: () => Promise<Loaded<T>>, signal?: AbortSignal): Promise<T> {
      const cached = peek<T>(key);
      if (cached !== undefined) return signal?.aborted ? Promise.reject(abortError()) : Promise.resolve(cached);
      const flightKey = `${version}\u0000${key}`;
      const pending = inFlight.get(flightKey) as Promise<T> | undefined;
      if (pending) {
        stats.shared++;
        return forCaller(pending, signal);
      }
      stats.misses++;
      const asked = version;
      // Never given the caller's signal: other callers may join it, and a finished answer is worth keeping.
      const shared = fetcher().then(
        (loaded) => {
          if (inFlight.get(flightKey) === shared) inFlight.delete(flightKey);
          noteVersion(loaded.version);
          const computedFor = loaded.version === undefined ? asked : loaded.version;
          if (computedFor !== null && asked === version && computedFor === version) keep(key, loaded.value, loaded.bytes);
          return loaded.value;
        },
        (error: unknown) => {
          if (inFlight.get(flightKey) === shared) inFlight.delete(flightKey);
          throw error;
        },
      );
      inFlight.set(flightKey, shared);
      return forCaller(shared, signal);
    },
    put(key, value, size, fetchedUnder) {
      if (fetchedUnder === null || fetchedUnder !== version) return;
      keep(key, value, size);
    },
    noteVersion,
    onStale(listener) {
      staleListeners.add(listener);
      return () => {
        staleListeners.delete(listener);
      };
    },
    noteMiss() {
      stats.misses++;
    },
    takeStats() {
      const taken = stats;
      stats = { ...NO_STATS };
      return taken;
    },
    get size() {
      return { entries: entries.size, bytes };
    },
  };
}

/** The response header naming the data version a query result was computed under (src/query/data-version.server.ts). */
export const DATA_VERSION_HEADER = "X-Orbital-Data-Version";

/** The page's one cache: pins, comparisons and Investigate's views share it. */
export const queryCache = createQueryCache();

const sortedFilter = (filter: Query["filter"]) =>
  Object.entries(filter ?? {})
    .map(([dimension, values]) => [dimension, [...(values ?? [])].sort()] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

/**
 * A query's cache key. Filter dimensions and their values are sets, so their order doesn't matter; `by` is
 * kept in order, since it orders the result's columns.
 */
export function queryKey(query: Query): string {
  return JSON.stringify([query.measure, query.by, sortedFilter(query.filter), query.sort ?? null, query.limit ?? null]);
}

const PAGES = ["investigate", "decide", "result", "settings"] as const;

/**
 * The page a cache summary is for, from a fixed list (Frank's note on #189): a path the list doesn't name is
 * "other", so a route added later can't send its path's text.
 */
export function pageOf(pathname: string): string {
  const first = pathname.split("/")[1] ?? "";
  if (first === "") return "station";
  return (PAGES as readonly string[]).includes(first) ? first : "other";
}

/** One summary per page view, not one event per hit: sent when the player leaves the page, if it used the cache. */
export function flushQueryCacheStats(cache: QueryCache, track: Track, page: string) {
  const stats = cache.takeStats();
  if (stats.hits + stats.misses + stats.shared + stats.overtaken === 0) return;
  track("query_cache_summary", { page, ...stats, entries: cache.size.entries });
}
