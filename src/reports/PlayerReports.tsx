import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useBlocker, useFetcher, useNavigate, useSearchParams } from "react-router";

import { quarterName } from "~/game/event-title";
import { PinChart } from "~/investigate/pins/PinnedCharts";
import { pinKey, type PinSpec } from "~/investigate/pins/spec";
import { usePins } from "~/investigate/pins/usePins";
import { track } from "~/platform/analytics/analytics.client";
import { PLAYER_COPY as COPY } from "./copy";
import { checkReport, REPORT_LIMITS, type PlayerReport, type RefusalReason } from "./player";
import styles from "./Reports.module.css";

// The player's own reports (docs/design/reports.md section 3): a list, one report open to read, or the editor. Where
// the page is lives in the URL (?report=, ?edit=, ?new=1, and &add= for a pin brought from Investigate), so Back
// works and a pin's "Add to report" can link straight in.

type Draft = { title: string; summary: string; items: { spec: PinSpec; note: string }[] };
type Answer = { ok: true; id: string; intent: string } | { ok: false; reason: RefusalReason };

const REFUSED: Record<RefusalReason, string> = {
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
  };
}

const draftOf = (report?: PlayerReport): Draft => ({
  title: report?.title ?? "",
  summary: report?.summary ?? "",
  items: (report?.items ?? []).map((i) => ({ spec: i.spec, note: i.note ?? "" })),
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
}: {
  reports: PlayerReport[];
  editable: boolean;
  quarters: readonly string[];
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
        />
      ) : open ? (
        <ReportView report={open} editable={editable} quarters={quarters} />
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
}: {
  report: PlayerReport;
  editable: boolean;
  quarters: readonly string[];
}) {
  return (
    <article className={styles.report} aria-labelledby="report-title">
      <header className={styles.reportHeader}>
        <h3 id="report-title" className={styles.reportTitle}>
          {report.title}
        </h3>
        <div className={styles.actions}>
          {editable && <Link to={`?edit=${report.id}`}>{COPY.edit}</Link>}
          {editable && <DeleteReport report={report} />}
          <Link to="/reports">{COPY.close}</Link>
        </div>
      </header>
      {report.summary && <p className={styles.note}>{report.summary}</p>}
      <ReportCharts items={report.items} quarters={quarters} />
    </article>
  );
}

/** A report's charts, each with its note: shared by Reports and Decide's panel. */
export function ReportCharts({
  items,
  quarters,
}: {
  items: PlayerReport["items"];
  quarters: readonly string[];
}) {
  return (
    <ol className={styles.reportCharts}>
      {items.map((item) => (
        <li
          key={pinKey(item.spec)}
          className={styles.card}
          data-wide={item.spec.kind === "heatmap" || undefined}
        >
          <h4 className={styles.cardTitle}>{item.spec.title}</h4>
          {everyQuarter(item.spec) && <span className={styles.muted}>{COPY.everyQuarter}</span>}
          <PinChart spec={item.spec} quarters={quarters} onError={() => {}} />
          {item.note && <p className={styles.note}>{item.note}</p>}
        </li>
      ))}
    </ol>
  );
}

/** A chart over every quarter grows as quarters are played: its caption says so. */
function everyQuarter(spec: PinSpec): boolean {
  if (spec.kind === "comparison") return false;
  return !spec.query.filter?.quarter && !spec.query.filter?.month;
}

/** Delete report: asks once, and is final. */
function DeleteReport({ report, onDeleted }: { report: PlayerReport; onDeleted?: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const fetcher = useFetcher<Answer>();
  const navigate = useNavigate();
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data?.ok) return;
    onDeleted?.();
    void navigate("/reports");
  }, [fetcher.state, fetcher.data]);
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
              void fetcher.submit({ intent: "delete", id: report.id }, { method: "post" });
              dialog.current?.close();
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
}: {
  report?: PlayerReport;
  add: string | null;
  quarters: readonly string[];
}) {
  const initial = useMemo(() => draftOf(report), [report]);
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

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.ok) {
      leaving.current = true;
      void navigate(`/reports?report=${fetcher.data.id}`);
    } else setError(REFUSED[fetcher.data.reason]);
  }, [fetcher.state, fetcher.data]);

  const save = () => {
    const checked = checkReport(inputOf(draft));
    if (!checked.ok) return setError(REFUSED[checked.reason]);
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
      <ol className={styles.reportCharts}>
        {draft.items.map((item, i) => (
          <li
            key={pinKey(item.spec)}
            className={styles.card}
            data-wide={item.spec.kind === "heatmap" || undefined}
          >
            <h4 className={styles.cardTitle}>{item.spec.title}</h4>
            <PinChart spec={item.spec} quarters={quarters} onError={() => {}} />
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
        <Link to={report ? `/reports?report=${report.id}` : "/reports"}>{COPY.cancel}</Link>
        {report && <DeleteReport report={report} onDeleted={() => (leaving.current = true)} />}
      </div>
      {blocker.state === "blocked" && (
        <div role="alertdialog" aria-labelledby="leave-question" className={styles.inlineDialog}>
          <p id="leave-question">{COPY.leave.question}</p>
          <div className={styles.actions}>
            <button type="button" onClick={() => blocker.proceed()}>
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
