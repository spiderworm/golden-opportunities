// What POST /api/assistant streams to the browser, one JSON object per line. Shared by the server and the panel.

import type { QueryResult } from "../query/types.ts";
import type { ChartSpec, ComparisonResult } from "./tools/definitions.ts";

export type WireEvent =
  | { type: "text"; text: string }
  | ({ type: "data" } & QueryResult)
  | ({ type: "comparison" } & ComparisonResult)
  | { type: "pin"; chart: ChartSpec; source: string }
  | { type: "lookup_failed"; message: string }
  | { type: "error"; message: string }
  | { type: "done" };
