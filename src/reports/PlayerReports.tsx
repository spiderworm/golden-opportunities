import { useEffect, useMemo, useRef, useState } from "react";
import {
  Link,
  useBlocker,
  useFetcher,
  useNavigate,
  useSearchParams,
  useSubmit,
} from "react-router";

import { quarterName } from "~/game/event-title";
import { PinChart } from "~/investigate/pins/PinnedCharts";
import { noChartReason, TableToggle } from "~/platform/ui/TableToggle";
import { MAX_SERIES } from "~/platform/charts/chart-theme";
import { noChart, pinKey, shownAsTable, type PinSpec } from "~/investigate/pins/spec";
import { usePins } from "~/investigate/pins/usePins";
import { track } from "~/platform/analytics/analytics.client";
import { filterOf, segmented } from "~/segments/apply";
import { SEGMENT_COPY } from "~/segments/copy";
import type { Segment } from "~/segments/segments";
import { PLAYER_COPY as COPY, RUN_FOR_COPY } from "./copy";
import { moveChart, newestQuarter, runOffset, runQuarter, type RunChoice } from "./run-for";
import { nowShows, RunForNote, RunForPicker } from "./RunFor";
import {
  checkReport,
  editCounts,
  REPORT_LIMITS,
  reportCounts,
  type PlayerReport,
  type RefusalReason,
  type ReportInput,
} from "./player";
import styles from "./Reports.module.css";

// The player's own reports (docs/design/reports.md section 3): a list, one report open to read, or the editor. Where
// the page is lives in the URL (?report=, ?edit=, ?new=1, and &add= for a pin brought from Investigate), so Back
// works and a pin's "Add to report" can link straight in.

type Draft = {
  title: string;
  summary: string;
  items: { spec: PinSpec; note: string }[];
  /** The report's own segment's id, or "" for none. */
  segment: string;
};
type Answer =
  { ok: true; id: string; intent: string } | { ok: false; reason: RefusalReason | "busy" };

const REFUSED: Record<RefusalReason | "busy", string> = {
  busy: COPY.busy,
  no_title: COPY.noTitle,
  no_charts: COPY.noCharts,
  full: COPY.full,
  limit: COPY.limit,
  invalid: COPY.invalid,
};

/** The report as the action takes it: notes and the summary left out when empty. */
function inputOf(draft: Draft) {
  return {
    title: draft.title,
    ...(draft.summary.trim() ? { summary: draft.summary } : {}),
    items: draft.items.map(({ spec, note }) => (note.trim() ? { spec, note } : { spec })),
    ...(draft.segment ? { segment: draft.segment } : {}),
  };
}

/** A report as the editor starts it. A segment deleted since it was chosen reads as None, and goes when it's saved. */
const draftOf = (report: PlayerReport | undefined, segments: readonly Segment[]): Draft => ({
  title: report?.title ?? "",
  summary: report?.summary ?? "",
  items: (report?.items ?? []).map((i) => ({ spec: i.spec, note: i.note ?? "" })),
  segment: segments.some((s) => s.id === report?.segment) ? report!.segment! : "",
});

/** New report, beside the greeting; off at the limit, saying why. */
export function NewReportButton({ count }: { count: number }) {
  const full = count >= REPORT_LIMITS.reports;
  return full ? (
    <div className={styles.newReport}>
      <button type="button" className={styles.primary} disabled aria-describedby="report-limit">
        {COPY.newReport}
      </button>
      <span id="report-limit" className={styles.muted}>
        {COPY.limit}
      </span>
    </div>
  ) : (
    <Link to="?new=1" className={styles.primary}>
      {COPY.newReport}
    </Link>
  );
}

export function PlayerReports({
  reports,
  editable,
  quarters,
  segments,
}: {
  reports: PlayerReport[];
  editable: boolean;
  quarters: readonly string[];
  /** The player's saved segments, for the charts and reports that carry one. */
  segments: readonly Segment[];
}) {
  const [params] = useSearchParams();
  const open = reports.find((r) => r.id === params.get("report"));
  const editing = editable ? reports.find((r) => r.id === params.get("edit")) : undefined;
  const creating = editable && params.get("new") === "1" && reports.length < REPORT_LIMITS.reports;
  return (
    <section className={styles.section} aria-labelledby="player-reports">
      <h2 id="player-reports" className={styles.sectionHeading}>
        {COPY.heading}
      </h2>
      {creating || editing ? (
        <Editor
          key={editing?.id ?? "new"}
          report={editing}
          add={params.get("add")}
          quarters={quarters}
          segments={segments}
        />
      ) : open ? (
        // Keyed by report, so Run for… opens each report as saved (Chart, #410).
        <ReportView
          key={open.id}
          report={open}
          editable={editable}
          quarters={quarters}
          segments={segments}
        />
      ) : reports.length === 0 ? (
        <p className={styles.muted}>{COPY.empty}</p>
      ) : (
        <ul className={styles.cards}>
          {reports.map((r) => (
            <li key={r.id} className={styles.card}>
              <h3 className={styles.cardTitle}>{r.title}</h3>
              <span className={styles.muted}>
                {COPY.meta(r.items.length, quarterName(r.edited))}
              </span>
              {(r.summary ?? r.items.find((i) => i.note)?.note) && (
                <p className={styles.clamp}>{r.summary ?? r.items.find((i) => i.note)?.note}</p>
              )}
              <div className={styles.actions}>
                <Link to={`?report=${r.id}`}>{COPY.open}</Link>
                {editable && <Link to={`?edit=${r.id}`}>{COPY.edit}</Link>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** A report, read: its summary, then each chart, run again now, with its note. */
function ReportView({
  report,
  editable,
  quarters,
  segments,
}: {
  report: PlayerReport;
  editable: boolean;
  quarters: readonly string[];
  segments: readonly Segment[];
}) {
  const [choice, setChoice] = useState<RunChoice>("saved");
  const runFor = runQuarter(choice, quarters);
  return (
    <article className={styles.report} aria-labelledby="report-title">
      <header className={styles.reportHeader}>
        <h3 id="report-title" className={styles.reportTitle}>
          {report.title}
        </h3>
        <div className={styles.actions}>
          <RunForPicker
            choice={choice}
            quarters={quarters}
            onChoose={(next) => {
              track("report_run_for", runForEvent("report", next, report));
              setChoice(next);
            }}
          />
          {editable && <Link to={`?edit=${report.id}`}>{COPY.edit}</Link>}
          {editable && <DeleteReport report={report} />}
          <Link to="/reports">{COPY.close}</Link>
        </div>
      </header>
      <ReportSegmentLine report={report} segments={segments} />
      <RunForNote
        quarter={runFor}
        movable={
          !!runFor && planRun(report.items, segments, quarters, report.segment, runFor).movable
        }
        onBack={() => setChoice("saved")}
      />
      {report.summary && <p className={styles.note}>{report.summary}</p>}
      <ReportCharts
        items={report.items}
        quarters={quarters}
        segments={segments}
        segment={report.segment}
        runFor={runFor}
      />
    </article>
  );
}

/**
 * Under a report's title, its own segment: `Every chart here shows {name}.`, or, once it's deleted, that the charts
 * show their own filters now (Plot, section 8). Shared by Reports and Decide's panel.
 */
export function ReportSegmentLine({
  report,
  segments,
}: {
  report: Pick<PlayerReport, "segment">;
  segments: readonly Segment[];
}) {
  if (!report.segment) return null;
  const segment = segments.find((s) => s.id === report.segment);
  return (
    <p className={styles.muted}>
      {segment ? SEGMENT_COPY.onReport(segment.name) : SEGMENT_COPY.deleted}
    </p>
  );
}

/** report_run_for: where, what it's run for as a kind (never a title), and the report's number of charts. */
export function runForEvent(where: "report" | "decide", choice: RunChoice, report: PlayerReport) {
  const to = choice === "saved" ? "saved" : /^\d{4}-Q[1-4]$/.test(choice) ? "quarter" : choice;
  return { where, to, charts: report.items.length };
}

/**
 * A report run for a quarter: how many quarters its charts move (from the newest any names as it runs now, with its
 * segments), and whether any of them can.
 */
export function planRun(
  items: PlayerReport["items"],
  segments: readonly Segment[],
  quarters: readonly string[],
  segment: Segment | string | null | undefined,
  runFor: string,
) {
  const own =
    typeof segment === "string"
      ? (segments.find((s) => s.id === segment) ?? null)
      : (segment ?? null);
  const runs = items.flatMap((i) => segmented(i.spec, segments, quarters, own).spec ?? []);
  const newest = newestQuarter(runs, quarters);
  const by = newest ? runOffset(newest, runFor) : 0;
  return { by, movable: runs.some((r) => moveChart(r, by, quarters).stays === null) };
}

/** A report's charts, each with its note: shared by Reports and Decide's panel. */
export function ReportCharts({
  items,
  quarters,
  segments,
  segment: id,
  where = "report",
  runFor = null,
}: {
  items: PlayerReport["items"];
  quarters: readonly string[];
  /** The player's saved segments now, and the report's own segment's id, if it has one. */
  segments: readonly Segment[];
  segment?: string;
  /** Where it's read, for table_toggled: on Reports, or in Decide's panel. */
  where?: "report" | "decide";
  /** The quarter it's run for (src/reports/run-for.ts), or null as saved. */
  runFor?: string | null;
}) {
  const keys = itemKeys(items);
  const segment = segments.find((s) => s.id === id) ?? null;
  // Run for another quarter: every chart moves by the same number of quarters, counted from the newest any of them
  // names as it runs now, with its segments (Goldy's call; Plot, section 9).
  const move = useMemo(() => {
    if (!runFor) return undefined;
    const { by } = planRun(items, segments, quarters, segment, runFor);
    return (run: PinSpec) => {
      const moved = moveChart(run, by, quarters);
      if (moved.stays)
        return { spec: moved.spec, note: RUN_FOR_COPY.stays[moved.stays](quarterName(runFor)) };
      // Moved: its title may name the quarters it was saved with, so a line says what it shows now. Not when the
      // move is none (Plot and Chart, #412).
      const shows = by === 0 ? null : nowShows(moved.spec);
      return { spec: moved.spec, note: shows && RUN_FOR_COPY.now(shows) };
    };
  }, [runFor, items, segments, quarters, segment]);
  return (
    <ol className={styles.reportCharts}>
      {items.map((item, i) => (
        <li
          key={keys[i]}
          className={styles.card}
          data-wide={item.spec.kind === "heatmap" || undefined}
        >
          <ToggledChart
            spec={item.spec}
            quarters={quarters}
            segments={segments}
            segment={segment}
            move={move}
            onTable={(table) =>
              track("table_toggled", { where, shown: table, kind: item.spec.kind })
            }
          />
          {item.note && <p className={styles.note}>{item.note}</p>}
        </li>
      ))}
    </ol>
  );
}

/**
 * A report item's chart with its title and Table toggle (David, 3 Nov 2026), as a pin has them. Read, the view is
 * the reader's for now, starting as the item was saved; in the editor, `table` and `onTable` keep it with the report.
 */
function ToggledChart({
  spec,
  quarters,
  segments,
  segment,
  move,
  table: kept,
  onTable,
}: {
  spec: PinSpec;
  quarters: readonly string[];
  segments: readonly Segment[];
  /** The report's own segment, if it has one and it's still saved. */
  segment: Segment | null;
  /** The report run for another quarter: the chart as it runs then (PinChart's). */
  move?: (run: PinSpec) => { spec: PinSpec; note: string | null };
  table?: boolean;
  onTable: (table: boolean) => void;
}) {
  const [local, setLocal] = useState(spec.kind !== "comparison" && shownAsTable(spec));
  const [tooMany, setTooMany] = useState<number | null>(null);
  // Nothing matches both its filters and the report's segment: no table or chart, and Table says so, keeping its state
  // (Plot, #407).
  // What it runs with: its segment's filters now, and the report's segment (Chart and Audit, #407).
  const run = segmented(spec, segments, quarters, segment).spec;
  const empty = run === null;
  const why = noChartReason(noChart(spec), tooMany, MAX_SERIES);
  const table = (why !== null && !empty) || (kept ?? local);
  return (
    <>
      <div className={styles.itemHeader}>
        <h4 className={styles.cardTitle}>{spec.title}</h4>
        <TableToggle
          table={table}
          label={spec.title}
          disabledReason={empty ? SEGMENT_COPY.noTable : why}
          onChange={(next) => {
            setLocal(next);
            onTable(next);
          }}
        />
      </div>
      {/* Run for another quarter, its stays-as-saved line says it instead (Plot, #412). */}
      {run && !move && everyQuarter(run) && (
        <span className={styles.muted}>{COPY.everyQuarter}</span>
      )}
      <PinChart
        spec={spec}
        quarters={quarters}
        segments={segments}
        reportSegment={segment}
        move={move}
        table={table}
        onTooMany={setTooMany}
        onError={(code) => track("report_chart_failed", { code })}
      />
    </>
  );
}

/** A chart over every quarter grows as quarters are played: its caption says so. Asked of what it runs with. */
function everyQuarter(spec: PinSpec): boolean {
  // A comparison and a waterfall name their quarters.
  if (spec.kind === "comparison" || spec.kind === "waterfall") return false;
  const filter = filterOf(spec);
  return !filter.quarter && !filter.month;
}

/**
 * Delete report: asks once, and is final. A navigating submission to /reports, so the page ends on the list: the
 * report it was showing is gone with it.
 */
function DeleteReport({ report, onDeleted }: { report: PlayerReport; onDeleted?: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const submit = useSubmit();
  return (
    <>
      <button
        ref={opener}
        type="button"
        className={styles.danger}
        onClick={() => dialog.current?.showModal()}
      >
        {COPY.delete.button}
      </button>
      <dialog
        ref={dialog}
        role="alertdialog"
        aria-labelledby={`delete-${report.id}`}
        className={styles.dialog}
        onClose={() => opener.current?.focus()}
      >
        <p id={`delete-${report.id}`}>{COPY.delete.question(report.title)}</p>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.danger}
            onClick={() => {
              // Before the submission, so the editor's leave guard lets it go.
              onDeleted?.();
              track("report_deleted", { charts: report.items.length });
              dialog.current?.close();
              void submit(
                { intent: "delete", id: report.id },
                { method: "post", action: "/reports" },
              );
            }}
          >
            {COPY.delete.confirm}
          </button>
          <button type="button" autoFocus onClick={() => dialog.current?.close()}>
            {COPY.delete.keep}
          </button>
        </div>
      </dialog>
    </>
  );
}

/** The editor: the report itself in edit mode, written whole by Save report. */
function Editor({
  report,
  add,
  quarters,
  segments,
}: {
  report?: PlayerReport;
  add: string | null;
  quarters: readonly string[];
  segments: readonly Segment[];
}) {
  const initial = useMemo(() => draftOf(report, segments), [report]);
  const [draft, setDraft] = useState<Draft>(initial);
  const [error, setError] = useState<string | null>(null);
  const { pins } = usePins(track);
  const fetcher = useFetcher<Answer>();
  const navigate = useNavigate();
  const leaving = useRef(false);

  // A pin brought from Investigate's "Add to report" joins once the board has loaded (it's kept in this browser).
  const added = useRef(false);
  useEffect(() => {
    if (added.current || !add) return;
    const pin = pins.find((p) => p.id === add);
    if (!pin) return;
    added.current = true;
    setDraft((d) =>
      d.items.length >= REPORT_LIMITS.items || d.items.some((i) => pinKey(i.spec) === pinKey(pin))
        ? d
        : { ...d, items: [...d.items, { spec: specOf(pin), note: "" }] },
    );
  }, [pins, add]);

  const changed = JSON.stringify(draft) !== JSON.stringify(initial);
  const blocker = useBlocker(() => changed && !leaving.current);

  // What was sent, for the event once the save answers.
  const sent = useRef<ReportInput | null>(null);
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.ok) {
      const saved = sent.current!;
      if (report)
        track("report_edited", { ...reportCounts(saved), ...editCounts(inputOf(initial), saved) });
      else
        track("report_created", { ...reportCounts(saved), from: add ? "investigate" : "reports" });
      leaving.current = true;
      void navigate(`/reports?report=${fetcher.data.id}`);
    } else {
      if (fetcher.data.reason !== "busy") track("report_refused", { reason: fetcher.data.reason });
      setError(REFUSED[fetcher.data.reason]);
    }
  }, [fetcher.state, fetcher.data]);

  const save = () => {
    const checked = checkReport(inputOf(draft));
    if (!checked.ok) {
      track("report_refused", { reason: checked.reason });
      return setError(REFUSED[checked.reason]);
    }
    sent.current = checked.report;
    setError(null);
    void fetcher.submit(
      {
        intent: report ? "update" : "create",
        ...(report ? { id: report.id } : {}),
        report: JSON.stringify(checked.report),
      },
      { method: "post", action: "/reports" },
    );
  };
  const setItem = (i: number, change: Partial<Draft["items"][number]>) =>
    setDraft((d) => ({
      ...d,
      items: d.items.map((it, j) => (j === i ? { ...it, ...change } : it)),
    }));
  const move = (i: number, by: -1 | 1) =>
    setDraft((d) => {
      const items = [...d.items];
      [items[i], items[i + by]] = [items[i + by]!, items[i]!];
      return { ...d, items };
    });
  const full = draft.items.length >= REPORT_LIMITS.items;
  const draftSegment = segments.find((s) => s.id === draft.segment) ?? null;
  const inReport = new Set(draft.items.map((i) => pinKey(i.spec)));

  return (
    <form
      className={styles.report}
      aria-label={report ? report.title : COPY.newReport}
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <label className={styles.field}>
        <span>{COPY.title}</span>
        <input
          value={draft.title}
          maxLength={REPORT_LIMITS.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        />
      </label>
      <label className={styles.field}>
        <span>{COPY.summary}</span>
        <textarea
          value={draft.summary}
          maxLength={REPORT_LIMITS.summary}
          rows={3}
          onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
        />
      </label>
      <label className={styles.field}>
        <span>{SEGMENT_COPY.reportField}</span>
        <select
          value={draft.segment}
          onChange={(e) => setDraft({ ...draft, segment: e.target.value })}
        >
          <option value="">{SEGMENT_COPY.none}</option>
          {segments.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <ol className={styles.reportCharts}>
        {draft.items.map((item, i) => (
          <li
            key={itemKeys(draft.items)[i]}
            className={styles.card}
            data-wide={item.spec.kind === "heatmap" || undefined}
          >
            {/* The view is the report's own: saved with it, so it reads as the player left it. */}
            <ToggledChart
              spec={item.spec}
              quarters={quarters}
              segments={segments}
              segment={draftSegment}
              table={item.spec.kind !== "comparison" && shownAsTable(item.spec)}
              onTable={(table) => {
                if (item.spec.kind !== "comparison") setItem(i, { spec: { ...item.spec, table } });
              }}
            />
            <label className={styles.field}>
              <span>{COPY.note}</span>
              <textarea
                value={item.note}
                maxLength={REPORT_LIMITS.note}
                rows={2}
                onChange={(e) => setItem(i, { note: e.target.value })}
              />
            </label>
            <div className={styles.actions}>
              <button type="button" disabled={i === 0} onClick={() => move(i, -1)}>
                {COPY.moveUp}
              </button>
              <button
                type="button"
                disabled={i === draft.items.length - 1}
                onClick={() => move(i, 1)}
              >
                {COPY.moveDown}
              </button>
              <button
                type="button"
                onClick={() =>
                  setDraft((d) => ({ ...d, items: d.items.filter((_, j) => j !== i) }))
                }
              >
                {COPY.remove}
              </button>
            </div>
          </li>
        ))}
      </ol>
      <fieldset className={styles.board}>
        <legend>{COPY.addCharts}</legend>
        {pins.length === 0 ? (
          <p className={styles.muted}>{COPY.noPins}</p>
        ) : (
          <>
            {full && <p className={styles.muted}>{COPY.full}</p>}
            <ul className={styles.plain}>
              {pins.map((pin) => {
                const there = inReport.has(pinKey(pin));
                return (
                  <li key={pin.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={there}
                        disabled={!there && full}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            items: e.target.checked
                              ? [...d.items, { spec: specOf(pin), note: "" }]
                              : d.items.filter((it) => pinKey(it.spec) !== pinKey(pin)),
                          }))
                        }
                      />{" "}
                      {pin.title}
                    </label>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </fieldset>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={fetcher.state !== "idle"}>
          {COPY.save}
        </button>
        <Link
          to={report ? `/reports?report=${report.id}` : "/reports"}
          onClick={() => {
            // Cancel puts it back: no guard, and the event says whether anything had changed.
            leaving.current = true;
            track("report_edit_cancelled", { changed });
          }}
        >
          {COPY.cancel}
        </Link>
        {report && <DeleteReport report={report} onDeleted={() => (leaving.current = true)} />}
      </div>
      {blocker.state === "blocked" && (
        <div role="alertdialog" aria-labelledby="leave-question" className={styles.inlineDialog}>
          <p id="leave-question">{COPY.leave.question}</p>
          <div className={styles.actions}>
            <button
              type="button"
              onClick={() => {
                track("report_edit_cancelled", { changed: true });
                blocker.proceed();
              }}
            >
              {COPY.leave.leave}
            </button>
            <button type="button" autoFocus onClick={() => blocker.reset()}>
              {COPY.leave.stay}
            </button>
          </div>
        </div>
      )}
    </form>
  );
}

/** A pin's spec alone: a report holds a copy of the pin, never the board's id or who pinned it. */
function specOf(pin: PinSpec & { id?: string; pinnedBy?: string }): PinSpec {
  const { id: _id, pinnedBy: _by, ...spec } = pin;
  return spec as PinSpec;
}

/**
 * A key for each item: its chart (pinKey), and which of that chart it is. A report saved before a chart and its
 * table were one pin can hold both (Audit, #314), so pinKey alone could repeat; the occurrence keeps keys unique and
 * still stable when items move, so moving one doesn't run the others' charts again.
 */
export function itemKeys(items: readonly { spec: PinSpec }[]): string[] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const key = pinKey(item.spec);
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    return `${key}#${n}`;
  });
}
