import { useEffect, useState } from "react";

import type { ReportsData } from "./data.server";

export const REPORTS_DATA_URL = "/api/reports";

/**
 * Reports' data for a panel on another page, fetched once `enabled`, from /api/reports with a plain fetch (see
 * api.ts for why not a fetcher). Null until it arrives; a failed or cut-off fetch leaves it null, as the panel's
 * "…" while it waits, and tries again the next time the panel is enabled.
 */
export function useReportsData(enabled: boolean): ReportsData | null {
  const [data, setData] = useState<ReportsData | null>(null);
  useEffect(() => {
    if (!enabled || data) return;
    const controller = new AbortController();
    fetch(REPORTS_DATA_URL, { signal: controller.signal, headers: { Accept: "application/json" } })
      .then((response) => (response.ok ? (response.json() as Promise<ReportsData>) : null))
      .then((next) => next && setData(next))
      .catch(() => {
        // Cut off by a navigation, or the network: nothing to show yet, and nothing to undo.
      });
    return () => controller.abort();
  }, [enabled, data]);
  return data;
}
