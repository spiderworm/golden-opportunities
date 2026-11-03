import tables from "./data.json";
import { joinBookshop } from "./joins";
import type { BookshopData, BookshopTables, DeepReadonly } from "./types";

export type BookshopTrack = (
  event: string,
  props?: Record<string, string | number | boolean>,
) => void;
let cached: DeepReadonly<BookshopData> | undefined;
/** Cached per runtime. Pass the platform analytics adapter to observe loads without content. */
export function loadBookshop(track?: BookshopTrack): DeepReadonly<BookshopData> {
  const started = performance.now();
  const cacheHit = cached !== undefined;
  cached ??= joinBookshop(tables as BookshopTables);
  track?.("bookshop_loaded", {
    cacheHit,
    durationMs: performance.now() - started,
    saleLines: cached.saleLines.length,
  });
  return cached;
}
