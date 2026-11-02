// What POST /api/assistant streams to the browser, one JSON object per line. Shared by the server and the panel.

import type { QueryResult } from "../query/types.ts";
import type { ChartSpec, ComparisonResult, LookupPin } from "./tools/definitions.ts";

export type WireEvent =
  | { type: "text"; text: string }
  // `pin` is what the player can pin from it: the query or comparison that ran, never its rows.
  | ({ type: "data"; pin?: LookupPin } & QueryResult)
  | ({ type: "comparison"; pin?: LookupPin } & ComparisonResult)
  | { type: "pin"; chart: ChartSpec; source: string }
  // A chart Dewey drew in the chat (show_chart): its spec, titled from its query, and the result it ran.
  | ({ type: "chart"; chart: ChartSpec; pin?: LookupPin } & QueryResult)
  | { type: "lookup_failed"; message: string }
  | { type: "error"; message: string }
  | { type: "done" };
