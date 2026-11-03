// The Reports action's writes to the player's reports (reports.md section 3). The browser's checks run again here,
// the server assigns ids, and created and edited are the quarter being played, never later (Audit, #171).
import { currentQuarter, removedQuarter } from "~/game/progress";
import type { QuarterId } from "~/game/quarters";
import type { GameSave } from "~/game/types";
import { checkReport, REPORT_LIMITS, type PlayerReport, type RefusalReason } from "./player";

export type ReportChange =
  | { intent: "create"; report: unknown }
  | { intent: "update"; id: string; report: unknown }
  | { intent: "delete"; id: string };

export type ReportOutcome =
  { ok: true; reports: PlayerReport[]; id: string } | { ok: false; reason: RefusalReason };

/** The quarter a report is stamped with: the one being played, or after the game, the last one played. */
function stamp(save: GameSave): QuarterId {
  return currentQuarter(save) ?? save.played.at(-1)?.period ?? "2194-Q1";
}

/** What a change makes of the save's reports, or why it's refused. Pure: the action writes what it returns. */
export function applyReportChange(
  save: GameSave,
  change: ReportChange,
  newId: () => string,
): ReportOutcome {
  // After removal, reports can still be opened, but no longer edited or made (reports.md section 2).
  if (removedQuarter(save) !== null) return { ok: false, reason: "invalid" };
  const reports = save.reports ?? [];
  const quarter = stamp(save);
  if (change.intent === "delete") {
    if (!reports.some((r) => r.id === change.id)) return { ok: false, reason: "invalid" };
    return { ok: true, reports: reports.filter((r) => r.id !== change.id), id: change.id };
  }
  const checked = checkReport(change.report);
  if (!checked.ok) return checked;
  if (change.intent === "create") {
    if (reports.length >= REPORT_LIMITS.reports) return { ok: false, reason: "limit" };
    const id = newId();
    return {
      ok: true,
      reports: [...reports, { id, ...checked.report, created: quarter, edited: quarter }],
      id,
    };
  }
  const old = reports.find((r) => r.id === change.id);
  if (!old) return { ok: false, reason: "invalid" };
  return {
    ok: true,
    reports: reports.map((r) =>
      r.id === change.id ? { id: r.id, ...checked.report, created: r.created, edited: quarter } : r,
    ),
    id: change.id,
  };
}

/** The change a form asks for: intent, the report as JSON, and the id for an edit or a delete. Null if malformed. */
export function changeFrom(form: FormData): ReportChange | null {
  const intent = form.get("intent");
  const id = form.get("id");
  let report: unknown;
  try {
    report = JSON.parse(String(form.get("report") ?? "null"));
  } catch {
    return null;
  }
  if (intent === "create") return { intent, report };
  if (typeof id !== "string") return null;
  if (intent === "update") return { intent, id, report };
  if (intent === "delete") return { intent, id };
  return null;
}
