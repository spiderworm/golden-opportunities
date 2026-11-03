import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useFetcher, useNavigate } from "react-router";

import { track } from "~/platform/analytics/analytics.client";

import { quarterName } from "~/game/event-title";
import { measureTexts, RESULT_COPY, scoreText, SERVICE_RECORD } from "~/result/copy";
import { DECIDE_COPY as COPY, REPORTS_COPY } from "./copy";
import type { PlayerReport } from "./player";
import { ReportCharts } from "./PlayerReports";
import type { ShopReport } from "./shop.server";
import styles from "./Reports.module.css";

// Reports in Decide (docs/design/reports.md section 4): the player reads their evidence beside the plan, without
// leaving the form. A side panel over the boss scene that never touches the plan: the form stays mounted under it,
// with whatever the player has picked. Read-only; Edit in Reports leaves, and asks first when there's a plan to lose.
// The reports come from Reports' own loader, fetched when Decide shows.

interface Loaded {
  reports: ShopReport[];
  player: PlayerReport[];
  quarters: string[];
}

/** One report open in the panel: the player's, by id, or a shop report, by quarter. */
export type Chosen = { type: "player"; id: string } | { type: "shop"; quarter: string } | null;

export function DecideReports({
  planStarted,
  quarter,
  onRead,
}: {
  planStarted: boolean;
  /** The quarter being planned, for the panel's events. */
  quarter: string;
  /** A report was chosen in the panel: its key, so the form can count the reports read before submitting. */
  onRead: (key: string) => void;
}) {
  const data = useFetcher<Loaded>();
  useEffect(() => {
    if (data.state === "idle" && !data.data) void data.load("/reports");
  }, []);
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  // The control that asked, so Stay returns focus to it (Audit, #286).
  const askedFrom = useRef<HTMLElement | null>(null);
  const toReports = () => {
    if (!planStarted) return void navigate("/reports");
    askedFrom.current = document.activeElement as HTMLElement | null;
    setAsking(true);
  };
  const stay = () => {
    setAsking(false);
    askedFrom.current?.focus();
  };

  if (!data.data) return null;
  const { player, reports, quarters } = data.data;
  return (
    <>
      {player.length ? (
        <button
          ref={button}
          type="button"
          className={styles.decideButton}
          aria-expanded={open}
          onClick={() => {
            if (!open)
              track("plan_reports_opened", {
                quarter,
                playerReports: player.length,
                shopReports: reports.length,
              });
            setOpen(!open);
          }}
        >
          {COPY.button(player.length)}
        </button>
      ) : (
        <button type="button" className={styles.decideButton} onClick={toReports}>
          {COPY.none}
        </button>
      )}
      {/* In the page's body: the plan banner clips what's inside it, and makes a fixed panel its own (measured on
          the build at 1440 px, where the panel was cut off at the banner's foot). */}
      {open &&
        createPortal(
          <Panel
            player={player}
            shop={reports}
            quarters={quarters}
            onClose={() => {
              setOpen(false);
              button.current?.focus();
            }}
            onEdit={toReports}
            onRead={(chosen, charts) => {
              track("plan_report_read", { quarter, type: chosen.type, charts });
              onRead(chosen.type === "player" ? `player:${chosen.id}` : `shop:${chosen.quarter}`);
            }}
          />,
          document.body,
        )}
      {asking &&
        createPortal(
          <div
            role="alertdialog"
            aria-labelledby="leave-decide"
            className={styles.decideAsk}
            onKeyDown={(e) => {
              // Escape is Stay, and stops here: not the panel's, nor Decide's own (Audit and Orbit, #286).
              if (e.key !== "Escape") return;
              e.stopPropagation();
              stay();
            }}
          >
            <p id="leave-decide">{COPY.leave.question}</p>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.primary}
                onClick={() => void navigate("/reports")}
              >
                {COPY.leave.go}
              </button>
              <button type="button" autoFocus onClick={stay}>
                {COPY.leave.stay}
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

/** The panel: the reports by title, then one read. Exported for its tests, which open it on a report (`initial`). */
export function Panel({
  player,
  shop,
  quarters,
  onClose,
  onEdit,
  onRead = () => {},
  initial = null,
}: {
  player: PlayerReport[];
  shop: ShopReport[];
  quarters: string[];
  onClose: () => void;
  onEdit: () => void;
  /** A report was chosen to read, with its number of charts (a shop report has none). */
  onRead?: (chosen: NonNullable<Chosen>, charts: number) => void;
  initial?: Chosen;
}) {
  const [chosen, setChosenState] = useState<Chosen>(initial);
  const setChosen = (next: Chosen) => {
    setChosenState(next);
    if (next)
      onRead(
        next,
        next.type === "player" ? (player.find((r) => r.id === next.id)?.items.length ?? 0) : 0,
      );
  };
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), [chosen]);
  // Escape closes the panel here, and stops: Decide's own Escape (a pinned move's line) waits for the next press.
  const escape = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    onClose();
  };
  const report = chosen?.type === "player" ? player.find((r) => r.id === chosen.id) : undefined;
  const quarter =
    chosen?.type === "shop" ? shop.find((r) => r.quarter === chosen.quarter) : undefined;
  return (
    <aside
      role="dialog"
      aria-labelledby="decide-reports-heading"
      className={styles.decidePanel}
      onKeyDown={escape}
    >
      <header className={styles.reportHeader}>
        <h2 id="decide-reports-heading" ref={heading} tabIndex={-1} className={styles.reportTitle}>
          {report?.title ??
            (quarter ? REPORTS_COPY.quarterReport(quarterName(quarter.quarter)) : COPY.heading)}
        </h2>
        <div className={styles.actions}>
          {chosen && (
            <button type="button" className={styles.linkButton} onClick={() => setChosen(null)}>
              {COPY.back}
            </button>
          )}
          <button type="button" className={styles.linkButton} onClick={onClose}>
            {COPY.close}
          </button>
        </div>
      </header>
      {report ? (
        <>
          {report.summary && <p className={styles.note}>{report.summary}</p>}
          <ReportCharts items={report.items} quarters={quarters} />
          <button type="button" className={styles.linkButton} onClick={onEdit}>
            {COPY.edit}
          </button>
        </>
      ) : quarter ? (
        <ShopSummary report={quarter} />
      ) : (
        <>
          <ul className={styles.plain}>
            {player.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={() => setChosen({ type: "player", id: r.id })}
                >
                  {r.title}
                </button>
              </li>
            ))}
          </ul>
          {shop.length > 0 && (
            <>
              <h3 className={styles.sectionHeading}>{COPY.shopHeading}</h3>
              <ul className={styles.plain}>
                {shop.map((r) => (
                  <li key={r.quarter}>
                    <button
                      type="button"
                      className={styles.linkButton}
                      onClick={() => setChosen({ type: "shop", quarter: r.quarter })}
                    >
                      {`${REPORTS_COPY.quarterReport(quarterName(r.quarter))}: ${scoreText(r.overall.score, r.overall.grade)}`}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </aside>
  );
}

/** A shop report in Decide: score, against goals and plan only, so the player sees what they did last time. */
function ShopSummary({ report: r }: { report: ShopReport }) {
  const months = REPORTS_COPY.months(r.quarter);
  const measure = (id: string) =>
    RESULT_COPY.reportCard.measures[id as keyof typeof RESULT_COPY.reportCard.measures];
  return (
    <dl className={styles.parts}>
      <dt>{REPORTS_COPY.parts.score}</dt>
      <dd>
        {`${scoreText(r.overall.score, r.overall.grade)}${r.overall.strike ? SERVICE_RECORD.strike : ""}. ${
          r.overall.allMet
            ? REPORTS_COPY.allMet
            : REPORTS_COPY.lowest(r.overall.binding.map(measure).join(" and "))
        }.`}
      </dd>
      <dt>{REPORTS_COPY.parts.goals}</dt>
      <dd>
        <ul className={styles.plain}>
          {r.measures.map((m) => {
            const text = measureTexts(m);
            return (
              <li key={m.id}>
                {`${measure(m.id)}: ${REPORTS_COPY.goalLine(text.result, text.goal)}, ${scoreText(m.score, m.grade)}`}
              </li>
            );
          })}
        </ul>
      </dd>
      <dt>{REPORTS_COPY.parts.plan}</dt>
      <dd>
        {r.plan.picks ? (
          <ul className={styles.plain}>
            {r.plan.picks.map((pick, i) => (
              <li key={months[i]}>{`${months[i]}: ${pick ?? REPORTS_COPY.noPick}`}</li>
            ))}
            {r.plan.moves.map((m) => (
              <li key={m}>{REPORTS_COPY.oneMore(m)}</li>
            ))}
          </ul>
        ) : r.plan.moves.length ? (
          r.plan.moves.join(", ")
        ) : (
          REPORTS_COPY.heldCourse
        )}
      </dd>
    </dl>
  );
}
