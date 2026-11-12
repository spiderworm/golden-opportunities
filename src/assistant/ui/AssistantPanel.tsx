// The chat panel: ask the station's reference assistant about the data. Replies stream in; every lookup it ran
// is shown under the reply with its source, so a figure without a source stands out. Lookups are tables; a chart
// Dewey drew (show_chart) is drawn by the page's own chart components, or shown as its table without them.

import {
  Fragment,
  Component,
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import type { Query, QueryResult } from "~/query/types";
import { flushSync } from "react-dom";
import { useRouteLoaderData } from "react-router";
import type { WireEvent } from "../events.ts";
import { track as platformTrack } from "~/platform/analytics/analytics.client";
import { ASSISTANT_NAME as NAME } from "../name.ts";
import {
  drawnKind as queryChartKind,
  type ChartSpec,
  type LookupPin,
} from "../tools/definitions.ts";
import { NO_CHART, TableToggle } from "~/platform/ui/TableToggle";
import { dataQuery, foldLookups } from "./fold.ts";
import { timelineHeadings } from "./timeline.ts";
import {
  browserStorage,
  clearConversation,
  historyFor,
  INTERRUPTED,
  loadConversation,
  saveConversation,
} from "./conversation.ts";
import { canRenderWebGL2 } from "~/platform/webgl";
import { LOAD_CAP_MS, LoadingLine, useCommitment } from "~/platform/ui/commitment";
import { fetchStatus, type AssistantStatus } from "./status.ts";
import { askAssistant } from "./stream.ts";
// Only its type: the module itself is loaded lazily, below.
import type { Activity } from "./DeweyFaces3D";

// Dewey's faces in 3D, loaded only where they'll be drawn.
const DeweyFaces3D = lazy(() => import("./DeweyFaces3D"));

/** The platform's track(); injectable for tests. */
export type PanelTrack = (
  event: string,
  props?: Record<string, string | number | boolean>,
  options?: { hold?: "agent_text" },
) => void;

/** A pin also records whether the page took it (the dashboard can refuse a spec, or there may be none). */
type Lookup =
  | Extract<WireEvent, { type: "data" | "comparison" | "chart" | "lookup_failed" }>
  | (Extract<WireEvent, { type: "pin" }> & { placed: boolean });
interface Reply {
  question: string;
  text: string;
  lookups: Lookup[];
  error?: string;
  state: "streaming" | "done" | "stopped" | "failed" | typeof INTERRUPTED;
  /** The game's quarter when it was asked, for the timeline (timeline.ts); absent on a reply kept before. */
  quarter?: string;
  /** The game it was asked in, so another game's turns read as earlier; absent on a reply kept before. */
  game?: string;
}

/** While an answer streams, the conversation is saved at most this often. */
const SAVE_EVERY_MS = 1_000;

const QUESTION_MAX = 500;

/** The greeting, with the game's backstory sentence when there is one (docs/design/backstory.md, section 6). */
export const greeting = (short?: string) =>
  `Hello. I'm ${NAME}, on loan from the station library.${short ? ` ${short}` : ""} Ask me about your sales and I'll find the numbers or draw the chart. What they mean is up to you.`;

/**
 * Enter sends the question; Shift+Enter and Option+Enter (Alt+Enter) start a new line in it, and Enter while
 * composing (an IME) is the IME's.
 */
export function sendsQuestion(key: {
  key: string;
  shiftKey: boolean;
  altKey: boolean;
  isComposing: boolean;
}): boolean {
  return key.key === "Enter" && !key.shiftKey && !key.altKey && !key.isComposing;
}

/**
 * Option+Enter's new line (David, 4 Nov 2026: "I also need Option+Enter to add a new line… a standard in all web
 * UIs, for all chat input boxes"), put in by hand since browsers don't all type one for it: it replaces the
 * selection, and the caret goes after it. Null where it would take the question past its limit, as typing would.
 */
export function withNewline(
  value: string,
  start: number,
  end: number,
  max: number,
): { value: string; caret: number } | null {
  const next = value.slice(0, start) + "\n" + value.slice(end);
  return next.length > max ? null : { value: next, caret: start + 1 };
}

/**
 * Fits the question box to what's in it, however long, so everything typed shows (David, 2 Nov: "The user needs the
 * ability to see everything they've typed at all times"): it wraps, and grows a line at a time, with no limit.
 */
export function fitToText(
  box: Pick<HTMLTextAreaElement, "scrollHeight" | "offsetHeight" | "clientHeight"> & {
    style: { height: string };
  },
) {
  box.style.height = "auto";
  // scrollHeight is the text and padding; the border is what's left of the box's full height.
  box.style.height = `${box.scrollHeight + box.offsetHeight - box.clientHeight}px`;
}
const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

/** Draws a chart Dewey showed, with the page's own chart components. */
export type ChartRenderer = ComponentType<{ chart: ChartSpec; result: QueryResult }>;
/** Draws a lookup's table, with its evidence where it has some ("Based on", faded rows): the page's own, if any. */
export type TableRenderer = ComponentType<{ result: QueryResult }>;

/** Plot's tooltip for a change within noise (chart-features-copy.md, section 4). */
const NOISE_TIP =
  "A difference this small often shows up by chance with this much data, so don't read much into it.";

export function AssistantPanel({
  track = platformTrack,
  ChartView,
  TableView,
  chartProblem,
  onPin,
  onPinLookup,
  isPinned,
  fetcher,
  storage = browserStorage(),
  instance,
}: {
  track?: PanelTrack;
  /** Draws Dewey's charts; without it they show as tables. */
  ChartView?: ChartRenderer;
  /** Draws his tables with their evidence, as the page's own are; without it, the panel's plain table. */
  TableView?: TableRenderer;
  /**
   * Why a lookup's query can't be drawn by ChartView, if it can't, for its Table toggle: a lookup of several measures
   * that one chart doesn't take (Plot, section 11). The page's own rule, as ChartView is its own chart.
   */
  chartProblem?: (query: Query) => string | null;
  onPin?: (chart: ChartSpec) => boolean | void;
  /** The player pinning a lookup shown here; no Pin buttons without it. The page can refuse one. */
  onPinLookup?: (pin: LookupPin) => boolean | void;
  /** Whether a lookup's pin is already on the page's board. */
  isPinned?: (pin: LookupPin) => boolean;
  fetcher?: typeof fetch;
  /** Where the conversation is kept; injectable for tests. */
  storage?: Storage;
  /** Whose conversation it is; defaults to this copy's instance ID from the root loader. */
  instance?: string;
}) {
  const root = useRouteLoaderData("root") as { instance?: string } | undefined;
  const owner = instance ?? root?.instance ?? "local";
  const [replies, setReplies] = useState<Reply[]>([]);
  const [restored, setRestored] = useState(false);
  const lastSave = useRef(0);
  const [question, setQuestion] = useState("");
  const box = useRef<HTMLTextAreaElement>(null);
  // As it's typed, and once it's sent (emptied): the box the size of its text.
  useLayoutEffect(() => {
    if (box.current) fitToText(box.current);
  }, [question]);
  // And whenever it's narrowed or widened (the window, the panel), since the text wraps onto more lines or fewer
  // (Sage, #239). Only a change of width: the fit changes its height, which mustn't set it off again.
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let width = el.clientWidth;
    const watch = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      fitToText(el);
    });
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  const abort = useRef<AbortController | null>(null);
  const log = useRef<HTMLDivElement>(null);
  // Closing the panel stops the answer, and with it the process on the server.
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [replies]);
  // Restore after mounting (storage is the browser's, so the server renders an empty panel).
  useEffect(() => {
    const saved = loadConversation<Reply>(storage, owner);
    if (saved.length) {
      // Chats stored before folding can hold both a table and a chart of one query: one block, as now.
      setReplies(saved.map((r) => ({ ...r, lookups: foldLookups(r.lookups) })));
      track("assistant_conversation_restored", {
        turns: saved.length,
        interrupted: saved.some((r) => r.state === INTERRUPTED),
      });
    }
    setRestored(true);
  }, [owner]);
  // Keep it as shown: at once when an answer settles, and at most once a second while one streams.
  useEffect(() => {
    if (!restored) return;
    const streaming = replies.at(-1)?.state === "streaming";
    const wait = streaming ? SAVE_EVERY_MS - (Date.now() - lastSave.current) : 0;
    const save = () => {
      lastSave.current = Date.now();
      saveConversation(storage, owner, replies);
    };
    if (wait <= 0) return save();
    const timer = setTimeout(save, wait);
    return () => clearTimeout(timer);
  }, [replies, restored, owner]);
  // Whether the assistant can answer on this machine: asked on mount, and again after any error, so the
  // panel says it's offline before the player types (no Claude Code, or not signed in).
  const [status, setStatus] = useState<AssistantStatus>({ available: true });
  const checkStatus = () =>
    void fetchStatus(fetcher).then((s) => {
      setStatus(s);
      if (!s.available) track("assistant_offline_shown", { reason: s.reason });
    });
  useEffect(checkStatus, []);
  const offline = !status.available;
  // The chat's timeline: a heading where each quarter's replies start, worked out from the game's current quarter as
  // it's drawn, so a quarter later "Today" is that quarter's date (timeline.ts).
  const headings = timelineHeadings(replies, status);

  // Dewey's faces: his portrait, or in 3D where the browser draws WebGL 2 and motion is welcome. Neither shows until
  // the panel has committed to one (David, 3 Nov, AGENTS.md "Commit before you show": no portrait-then-canvas swap):
  // deciding (the server's render, and until the browser's checked), then the portraits at once, or the 3D faces
  // once one has drawn; the portraits again if the model doesn't come. Their places keep their size meanwhile.
  const [faces, setFaces] = useState<"deciding" | "portraits" | "loading" | "3d">("deciding");
  const { loading: facesLoading } = useCommitment(faces === "portraits" || faces === "3d");
  useEffect(() => {
    if (faces === "3d" || faces === "portraits") performance.mark(`dewey:committed-${faces}`);
  }, [faces]);
  // Which the player gets: "3d", or "portraits" and why; once, and once more only if the 3D faces fail after drawing.
  const facesSent = useRef<string | null>(null);
  const facesShown = (
    kind: "3d" | "portraits",
    reason?: "reduced_motion" | "no_webgl2" | "failed" | "timeout",
  ) => {
    if (facesSent.current === kind) return;
    facesSent.current = kind;
    track("assistant_faces_shown", reason ? { kind, reason } : { kind });
  };
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setFaces("portraits");
      return facesShown("portraits", "reduced_motion");
    }
    if (!canRenderWebGL2()) {
      setFaces("portraits");
      return facesShown("portraits", "no_webgl2");
    }
    performance.mark("dewey:faces-loading");
    setFaces("loading");
  }, []);
  const facesFailed = () => {
    setFaces("portraits");
    facesShown("portraits", "failed");
  };
  // A load that stalls, neither failing nor drawing, still commits: to the portraits (Audit, #361).
  useEffect(() => {
    if (faces !== "loading") return;
    const timer = setTimeout(() => {
      setFaces("portraits");
      facesShown("portraits", "timeout");
    }, LOAD_CAP_MS);
    return () => clearTimeout(timer);
  }, [faces]);
  const slots = useRef(new Map<number, HTMLElement>());
  // The face that talks: beside the turn with focus, or else the pointer, or else his last (the greeting, before
  // any question).
  const [focused, setFocused] = useState<number | null>(null);
  const [pointed, setPointed] = useState<number | null>(null);
  const talking = useRef(0);
  talking.current = talkingTurn(focused, pointed, replies.length);
  // The turn he's answering: thinking until his first words, then saying them as they stream in.
  const activity = useRef<Activity | null>(null);
  activity.current = activityOf(replies);
  const face = (turn: number) => ({
    turn,
    slots: slots.current,
    // The portraits only once they're what the panel has committed to; until then, and under the 3D faces, unseen.
    shown: faces !== "portraits",
    loading:
      turn === talking.current && faces !== "portraits" && faces !== "3d" ? facesLoading : null,
    onFocus: () => setFocused(turn),
    onBlur: () => setFocused((f) => (f === turn ? null : f)),
    onPointerEnter: () => setPointed(turn),
    onPointerLeave: () => setPointed((p) => (p === turn ? null : p)),
  });
  const busy = replies.at(-1)?.state === "streaming";

  // Starting over bumps the conversation, so an answer still winding down can't write into the new one.
  const conversation = useRef(0);
  const updater = (mine: number) => (change: (r: Reply) => Reply) =>
    setReplies((rs) =>
      conversation.current !== mine || !rs.length
        ? rs
        : [...rs.slice(0, -1), change(rs[rs.length - 1])],
    );

  async function send() {
    const text = question.trim();
    if (!text || busy || offline) return;
    // What players type stays on the device (David, 30 Oct); only its length is sent.
    track("agent_asked", { text, chars: text.length }, { hold: "agent_text" });
    track("assistant_question_sent", { chars: text.length, turn: replies.length });
    const history = historyFor(replies);
    const update = updater(conversation.current);
    setQuestion("");
    setReplies((rs) => [
      ...rs,
      {
        question: text,
        text: "",
        lookups: [],
        state: "streaming",
        ...(status.quarter ? { quarter: status.quarter } : {}),
        ...(status.game ? { game: status.game } : {}),
      },
    ]);
    const controller = new AbortController();
    abort.current = controller;
    const started = performance.now();
    let outcome = "done";
    try {
      for await (const event of askAssistant(
        text,
        history.slice(-6),
        onPin !== undefined,
        controller.signal,
        fetcher,
      )) {
        if (event.type === "text") update((r) => ({ ...r, text: r.text + event.text }));
        else if (
          event.type === "data" ||
          event.type === "comparison" ||
          event.type === "chart" ||
          event.type === "lookup_failed"
        )
          // A table and a chart of the same query are one block, the chart (fold.ts).
          update((r) => ({ ...r, lookups: foldLookups([...r.lookups, event]) }));
        else if (event.type === "pin" && onPin) {
          // Pins are only offered when onPin is wired; the page can still refuse one (Chart's pins.add).
          const placed = onPin(event.chart) !== false;
          track("assistant_pin_placed", {
            placed,
            kind: event.chart.kind,
            measures: measureCount(event.chart.query),
          });
          update((r) => ({ ...r, lookups: [...r.lookups, { ...event, placed }] }));
        } else if (event.type === "error") {
          outcome = "failed";
          update((r) => ({ ...r, error: event.message }));
          checkStatus();
        }
      }
    } catch (e) {
      outcome = controller.signal.aborted ? "stopped" : "failed";
      if (!controller.signal.aborted)
        update((r) => ({ ...r, error: "The connection to the assistant dropped." }));
    } finally {
      update((r) => ({
        ...r,
        state: outcome === "done" ? "done" : outcome === "stopped" ? "stopped" : "failed",
      }));
      track("assistant_reply_shown", {
        outcome,
        durationMs: Math.round(performance.now() - started),
      });
      if (abort.current === controller) abort.current = null;
    }
  }

  /** The player's Pin on a lookup; returns whether the page took it. */
  function pinLookup(pin: LookupPin): boolean {
    const placed = onPinLookup?.(pin) !== false;
    track("assistant_lookup_pinned", {
      kind: pin.kind,
      placed,
      measures: pin.kind === "comparison" ? 1 : measureCount(pin.query),
    });
    return placed;
  }

  function startOver() {
    conversation.current++;
    abort.current?.abort();
    track("assistant_conversation_cleared", { turns: replies.length });
    clearConversation(storage, owner);
    setReplies([]);
  }

  return (
    <section aria-label={`Ask ${NAME}`} style={styles.panel}>
      <header style={styles.header}>
        <strong>{NAME}</strong>
        <span style={styles.muted}>Station reference assistant</span>
        {replies.length > 0 && (
          <button type="button" style={styles.quiet} onClick={startOver}>
            New conversation
          </button>
        )}
      </header>
      <div style={styles.logHolder}>
        <div ref={log} style={styles.log} aria-live="polite">
          {offline && (
            <div role="status" style={styles.offline}>
              <p style={styles.offlineMessage}>{status.message}</p>
              <p style={styles.muted}>{status.hint}</p>
            </div>
          )}
          {replies.length === 0 && !offline && (
            <DeweyTurn
              face={face(0)}
              bubble={<p style={styles.answer}>{greeting(status.short)}</p>}
            />
          )}
          {replies.map((r, i) => (
            <Fragment key={i}>
              {headings[i] && <h3 style={styles.day}>{headings[i]}</h3>}
              <article style={styles.turn}>
                <p style={styles.question}>{r.question}</p>
                <DeweyTurn
                  face={face(i)}
                  bubble={
                    (r.text || r.state === "streaming") &&
                    (r.text ? (
                      <p style={styles.answer}>{r.text}</p>
                    ) : (
                      <p style={styles.muted}>Looking...</p>
                    ))
                  }
                >
                  {r.lookups.map((l, j) => (
                    <LookupView
                      key={j}
                      lookup={l}
                      ChartView={ChartView}
                      TableView={TableView}
                      chartProblem={chartProblem}
                      pinning={onPinLookup && { onPin: pinLookup, isPinned }}
                      onTable={(type, table, measures) =>
                        track("table_toggled", {
                          where: "dewey",
                          shown: table,
                          kind: type,
                          measures,
                        })
                      }
                    />
                  ))}
                  {r.error && <p style={styles.error}>{r.error}</p>}
                  {r.state === "stopped" && <p style={styles.muted}>Stopped.</p>}
                  {r.state === INTERRUPTED && (
                    <p style={styles.muted}>
                      Interrupted: this answer stopped when the page was reloaded or closed, before
                      it finished.
                    </p>
                  )}
                </DeweyTurn>
              </article>
            </Fragment>
          ))}
        </div>
        {(faces === "loading" || faces === "3d") && (
          <FacesBoundary onError={facesFailed}>
            <Suspense fallback={null}>
              <DeweyFaces3D
                slots={slots}
                talking={talking}
                activity={activity}
                onDrawn={() => {
                  performance.mark("dewey:faces-3d");
                  // At once: called from the faces' frame loop, an ordinary update waited ~250 ms behind it under
                  // load, and the loading line's timer fired in between (measured: Loading… for ~115 ms after drawing).
                  flushSync(() => setFaces("3d"));
                  facesShown("3d");
                }}
                onFailed={facesFailed}
              />
            </Suspense>
          </FacesBoundary>
        )}
      </div>
      <form
        style={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <textarea
          ref={box}
          aria-label={`Question for ${NAME}`}
          value={question}
          maxLength={QUESTION_MAX}
          rows={1}
          placeholder={offline ? `${NAME} is offline` : "What was revenue by quarter?"}
          disabled={offline}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.altKey && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              const el = e.currentTarget;
              const next = withNewline(el.value, el.selectionStart, el.selectionEnd, QUESTION_MAX);
              if (!next) return;
              // Drawn at once, so the caret is set in the text it belongs to.
              flushSync(() => setQuestion(next.value));
              el.setSelectionRange(next.caret, next.caret);
              return;
            }
            if (
              !sendsQuestion({
                key: e.key,
                shiftKey: e.shiftKey,
                altKey: e.altKey,
                isComposing: e.nativeEvent.isComposing,
              })
            )
              return;
            e.preventDefault();
            void send();
          }}
          style={styles.input}
        />
        {busy ? (
          <button type="button" style={styles.button} onClick={() => abort.current?.abort()}>
            Stop
          </button>
        ) : (
          <button type="submit" style={styles.button} disabled={offline || !question.trim()}>
            Ask
          </button>
        )}
      </form>
    </section>
  );
}

/**
 * Which of Dewey's turns has the face that talks (David: "next the speech bubble that has focus, or is mouse
 * hovered, or is the last of Dewey's messages"): the one with focus, else the pointer, else the last. With no
 * replies, the greeting's, turn 0.
 */
export function talkingTurn(focused: number | null, pointed: number | null, replies: number) {
  return focused ?? pointed ?? Math.max(0, replies - 1);
}

/** What Dewey is doing in his last turn, if it's still coming: thinking before any words, then saying them. */
export function activityOf(replies: readonly Pick<Reply, "state" | "text">[]): Activity | null {
  const last = replies.at(-1);
  if (last?.state !== "streaming") return null;
  return { turn: replies.length - 1, kind: last.text ? "saying" : "thinking" };
}

/** Dewey's portrait (David chose it, 2 Nov: the reading-lamp terminal, its spectacles low like a grandpa's). */
export const PORTRAIT = "/dewey/portrait.webp";

/**
 * Dewey's side of a turn: his face beside what he says, in a speech bubble, with his lookups under it. The bubble
 * is left out while there's nothing in it (a reply that's only lookups, or only an error).
 */
function DeweyTurn({
  face,
  bubble,
  children,
}: {
  face: {
    turn: number;
    slots: Map<number, HTMLElement>;
    /** Whether his portrait is hidden: drawn in 3D over it, or not committed to yet. It stays for its name. */
    shown: boolean;
    /** Beside the face that talks, until the faces are committed: whether to say Loading… (null: no line). */
    loading: boolean | null;
    onFocus: () => void;
    onBlur: () => void;
    onPointerEnter: () => void;
    onPointerLeave: () => void;
  };
  bubble?: ReactNode;
  children?: ReactNode;
}) {
  const { turn, slots, shown, loading, ...watch } = face;
  return (
    <div style={styles.dewey} {...watch}>
      {loading !== null && <LoadingLine loading={loading} style={styles.faceLoading} />}
      <img
        ref={(el) => {
          if (!el) return;
          slots.set(turn, el);
          return () => void (slots.get(turn) === el && slots.delete(turn));
        }}
        src={PORTRAIT}
        alt={NAME}
        width={AVATAR}
        height={AVATAR}
        style={shown ? styles.avatarUnder : styles.avatar}
      />
      <div style={styles.said}>
        {bubble && <div style={styles.bubble}>{bubble}</div>}
        {children}
      </div>
    </div>
  );
}

/** If the 3D faces fail to load or draw, the portraits stay. */
class FacesBoundary extends Component<{ onError: () => void; children: ReactNode }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

interface Pinning {
  onPin: (pin: LookupPin) => boolean;
  isPinned?: (pin: LookupPin) => boolean;
}

export function LookupView({
  lookup,
  pinning,
  ChartView,
  TableView,
  chartProblem,
  onTable,
}: {
  lookup: Lookup;
  pinning?: Pinning;
  ChartView?: ChartRenderer;
  TableView?: TableRenderer;
  chartProblem?: (query: Query) => string | null;
  /**
   * The Table toggle switched (David, 3 Nov 2026): the lookup's type, whether its table now shows, and how many
   * measures it has (a count, never which).
   */
  onTable?: (type: "data" | "chart" | "comparison", table: boolean, measures: number) => void;
}) {
  // A chart starts as a chart, a table as a table; the player can switch, where the page can draw charts.
  const [table, setTable] = useState(lookup.type !== "chart");
  if (lookup.type === "lookup_failed")
    return <p style={styles.muted}>A lookup didn't work: {lookup.message}</p>;
  if (lookup.type === "pin") {
    return (
      <figure style={styles.lookup}>
        <figcaption>
          {lookup.placed
            ? `Pinned to Investigate, below: ${lookup.chart.title}`
            : `Couldn't pin that chart: ${lookup.chart.title}`}
        </figcaption>
        <p style={styles.source}>Source: {lookup.source}</p>
      </figure>
    );
  }
  // The chart this lookup can be drawn as: its own, or for a table, its query's (Plot: one figure stays a table).
  const query = lookup.type === "data" ? (dataQuery(lookup) as Query | undefined) : undefined;
  const chart: ChartSpec | null =
    lookup.type === "chart"
      ? lookup.chart
      : query?.by.length
        ? { title: lookup.pin?.title ?? tableTitle(lookup), kind: queryChartKind(query), query }
        : null;
  // Why it can't be drawn: a comparison, or one figure. A table with no query (a chat stored long ago) has no toggle.
  const why =
    lookup.type === "comparison"
      ? NO_CHART.comparison
      : lookup.type === "data" && query && !query.by.length
        ? NO_CHART.figure
        : chart
          ? (chartProblem?.(chart.query) ?? null)
          : null;
  // A lookup of several measures (Sim's `measures`): its overall figures are its table's All row, not a Total line.
  const several = lookup.type !== "comparison" && Object.keys(lookup.measures ?? {}).length > 1;
  const toggle = ChartView && (chart || why) && (
    <TableToggle
      table={why !== null || table}
      label={chart?.title ?? lookup.pin?.title}
      disabledReason={why}
      onChange={(next) => {
        setTable(next);
        onTable?.(lookup.type, next, chart ? measureCount(chart.query) : 1);
      }}
    />
  );
  // The pin is what's shown: the chart, or its table.
  const pin =
    lookup.pin && lookup.pin.kind !== "comparison" && chart
      ? { ...lookup.pin, kind: chart.kind, table: table && !why }
      : lookup.pin;
  // The block's controls, together beside its title (David, 3 Nov 2026: "put the "pin" button right next to the
  // chart/table toggle"): the toggle, then Pin, in that focus order.
  const pinButton = pinning && pin && <PinButton pin={pin} pinning={pinning} />;
  const controls = (toggle || pinButton) && (
    <div style={styles.lookupControls}>
      {toggle}
      {pinButton}
    </div>
  );
  if (chart && ChartView && !table) {
    const {
      type: _type,
      pin: _pin,
      ...rest
    } = lookup as Extract<Lookup, { type: "data" | "chart" }>;
    const { chart: _chart, ...result } = rest as typeof rest & { chart?: unknown };
    return (
      <figure style={styles.lookup} aria-label={chart.title}>
        <div style={styles.lookupHeader}>
          <figcaption style={styles.chartTitle}>{chart.title}</figcaption>
          {controls}
        </div>
        <ChartView chart={chart} result={result as QueryResult} />
        {!several && result.total !== null && result.columns.length > 1 && (
          <p style={styles.muted}>Total: {number.format(result.total)}</p>
        )}
        <p style={styles.source}>{`Source: ${result.source}`}</p>
      </figure>
    );
  }
  // Every row, in a scrolling box: a reply's figures can come from any row, so none may be cut off.
  const shown: Record<string, unknown>[] = lookup.rows;
  const cell = (v: unknown) =>
    v === null || v === undefined
      ? "Unknown"
      : typeof v === "number"
        ? number.format(v)
        : String(v);
  // A comparison's change within noise, after its percent (or its change, from a zero base): "+2.1% · within noise"
  // (Plot's copy, section 4). Only where the data judged it within; a clear or unjudged change has no flag.
  const noted = (row: Record<string, unknown>, key: string) =>
    lookup.type === "comparison" &&
    row.noise === "within" &&
    key ===
      (row.percent_change === null || row.percent_change === undefined
        ? "change"
        : "percent_change");
  // A comparison's overall figures go in a last row; a breakdown's rows come first.
  const breakdown =
    lookup.type === "comparison" ? lookup.columns.find((c) => c.type === "string") : undefined;
  const totalRow: Record<string, unknown> | null =
    lookup.type === "comparison"
      ? { ...(breakdown ? { [breakdown.key]: "All" } : {}), ...lookup.total }
      : several
        ? {
            ...Object.fromEntries(
              lookup.columns
                .filter((c) => c.type === "string")
                .map((c, k) => [c.key, k === 0 ? "All" : ""]),
            ),
            ...Object.fromEntries(
              Object.entries(lookup.measures!).map(([m, figures]) => [m, figures!.total]),
            ),
          }
        : null;
  return (
    <figure style={styles.lookup}>
      {controls && (
        <div style={styles.lookupHeader}>
          {chart && lookup.type === "chart" ? (
            <figcaption style={styles.chartTitle}>{chart.title}</figcaption>
          ) : (
            <span />
          )}
          {controls}
        </div>
      )}
      {TableView && lookup.type !== "comparison" ? (
        // The page's own table, with the lookup's evidence (Based on, faded rows) as its own tables have it.
        <TableView result={lookup as QueryResult} />
      ) : (
        <div style={styles.rows}>
          <table style={styles.table}>
            <thead>
              <tr>
                {lookup.columns.map((c) => (
                  <th key={c.key} style={styles.th}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...shown, ...(totalRow ? [totalRow] : [])].map((row, i) => (
                <tr key={i}>
                  {lookup.columns.map((c) => (
                    <td key={c.key} style={c.type === "number" ? styles.num : styles.td}>
                      {cell(row[c.key])}
                      {noted(row, c.key) && (
                        <span style={styles.noise} title={NOISE_TIP}>
                          {" "}
                          · within noise
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(lookup.type === "data" || lookup.type === "chart") &&
        !several &&
        lookup.total !== null &&
        lookup.columns.length > 1 && (
          <p style={styles.muted}>Total: {number.format(lookup.total)}</p>
        )}
      <p style={styles.source}>Source: {lookup.source}</p>
    </figure>
  );
}

/**
 * A table's title for its chart when it has no pin to name it, from its columns: "Revenue by genre", or for several
 * measures "Revenue and units sold by quarter" (Plot, section 11).
 */
export function tableTitle(lookup: { columns: { label: string; type: string }[] }): string {
  const names = lookup.columns
    .filter((c) => c.type === "number")
    .map((c, i) => (i === 0 ? c.label : c.label.toLowerCase()));
  const measure =
    names.length < 2 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  const by = lookup.columns.find((c) => c.type === "string")?.label ?? "";
  return by ? `${measure} by ${by.toLowerCase()}` : measure;
}

/** How many measures a query asks for, for analytics: a count, never which. */
const measureCount = (query: Pick<Query, "also">) => 1 + (query.also?.length ?? 0);

/** Pins a lookup to Investigate's board, where it runs again as the player's own query. */
function PinButton({ pin, pinning }: { pin: LookupPin; pinning: Pinning }) {
  const [refused, setRefused] = useState(false);
  const pinned = pinning.isPinned?.(pin) ?? false;
  return (
    <div style={styles.pinRow}>
      <button
        type="button"
        style={styles.quietButton}
        disabled={pinned}
        title={pinned ? "Already pinned" : "Pin this to Investigate, below"}
        aria-label={pinned ? `Pinned: ${pin.title}` : `Pin ${pin.title}`}
        onClick={() => setRefused(!pinning.onPin(pin))}
      >
        {pinned ? "Pinned" : "Pin"}
      </button>
      {refused && !pinned && <span style={styles.muted}>Couldn't pin that.</span>}
    </div>
  );
}

/** Dewey's face beside each of his turns, in CSS pixels: large enough to see his screen's faces (David, 3 Nov). */
const AVATAR = 64;

const styles = {
  panel: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    padding: 16,
    background: "var(--color-panel)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-panel)",
    color: "var(--color-text)",
    fontFamily: "var(--font-body)",
  },
  // Room at the right for the column's fold button (DeweyColumn).
  header: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "baseline",
    gap: "4px 8px",
    paddingRight: 36,
  },
  offline: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: 10,
    background: "var(--color-panel-raised)",
    borderRadius: "var(--radius-control)",
  },
  offlineMessage: { margin: 0 },
  quiet: {
    marginLeft: "auto",
    padding: "2px 8px",
    background: "none",
    color: "var(--color-text-muted)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-control)",
    cursor: "pointer",
    fontSize: 12,
    // One line: at the column's narrowest the header wraps round it instead (Chart, #308).
    whiteSpace: "nowrap",
  },
  muted: { color: "var(--color-text-muted)", margin: 0, fontSize: 13 },
  noise: { color: "var(--color-text-muted)", fontSize: 12, whiteSpace: "nowrap" },
  // A quarter's heading in the log, small and quiet, centered between the turns (Plot's copy).
  day: {
    margin: "4px 0 0",
    textAlign: "center",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--color-text-muted)",
  },
  chartTitle: { fontSize: 13, fontWeight: 600, flex: "1 1 50%", minWidth: 0 },
  // A lookup's title with its Table toggle, as a pin's header has them.
  lookupHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 6,
  },
  // The toggle and Pin side by side, at the header's right. When something longer joins them ("Couldn't pin
  // that."), the group shrinks and wraps it underneath rather than squeeze the title, which keeps half the
  // header (Chart, #354).
  lookupControls: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 6,
    flex: "0 1 auto",
    minWidth: 0,
  },
  // As tall as the window allows beside the dashboard, and never less than it was.
  log: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    maxHeight: "max(480px, calc(100vh - 320px))",
    overflowY: "auto",
  },
  turn: { display: "flex", flexDirection: "column", gap: 8 },
  question: {
    margin: 0,
    alignSelf: "flex-end",
    background: "var(--color-accent-soft)",
    padding: "6px 10px",
    borderRadius: "var(--radius-control)",
  },
  answer: { margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.5 },
  dewey: { position: "relative", display: "flex", gap: 10, alignItems: "flex-start" },
  avatar: { flex: "none", borderRadius: "50%", background: "#1d2440" },
  // Under his 3D face: still there for its name and its place, but not seen.
  avatarUnder: { flex: "none", opacity: 0 },
  // Loading…, over the talking face's place while the faces aren't committed (the face is AVATAR square, at its left).
  faceLoading: {
    position: "absolute",
    width: AVATAR,
    height: AVATAR,
    margin: 0,
    display: "grid",
    placeItems: "center",
    fontSize: 10,
    color: "var(--color-text-muted)",
    pointerEvents: "none",
  },
  // The 3D faces' canvas lies over the conversation.
  logHolder: { position: "relative" },
  // Beside the face: the bubble, then his lookups; minWidth lets a wide table scroll rather than push the face off.
  said: { display: "flex", flexDirection: "column", gap: 8, flex: 1, minWidth: 0 },
  // A speech bubble, its corner by his face squared off as its tail.
  bubble: {
    alignSelf: "flex-start",
    padding: "6px 10px",
    background: "var(--color-panel-raised)",
    borderRadius: "var(--radius-control)",
    borderTopLeftRadius: 2,
  },
  error: { margin: 0, color: "var(--color-down)" },
  lookup: {
    margin: 0,
    padding: 10,
    background: "var(--color-panel-raised)",
    borderRadius: "var(--radius-control)",
    // The page's tables' sticky cells take this, to match the lookup they sit on.
    "--table-surface": "var(--color-panel-raised)",
  } as React.CSSProperties,
  table: { borderCollapse: "collapse", width: "100%", fontSize: 13 },
  rows: { maxHeight: 240, overflowY: "auto" },
  th: {
    textAlign: "left",
    color: "var(--color-text-muted)",
    fontWeight: 500,
    padding: "2px 8px 4px 0",
    position: "sticky",
    top: 0,
    background: "var(--color-panel-raised)",
  },
  td: { padding: "2px 8px 2px 0" },
  num: { padding: "2px 8px 2px 0", textAlign: "right", fontVariantNumeric: "tabular-nums" },
  source: { margin: "6px 0 0", color: "var(--color-text-muted)", fontSize: 12 },
  pinRow: { display: "flex", alignItems: "center", gap: 8 },
  quietButton: {
    padding: "2px 8px",
    background: "none",
    color: "var(--color-text)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-control)",
    cursor: "pointer",
    fontSize: 12,
  },
  // The button stays at the bottom as the question box grows.
  form: { display: "flex", gap: 8, alignItems: "flex-end" },
  input: {
    flex: 1,
    boxSizing: "border-box",
    padding: "8px 10px",
    background: "var(--color-space)",
    color: "var(--color-text)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-control)",
    font: "inherit",
    lineHeight: 1.4,
    resize: "none",
    overflow: "hidden",
  },
  button: {
    padding: "8px 14px",
    background: "var(--color-accent)",
    color: "var(--color-text)",
    border: "none",
    borderRadius: "var(--radius-control)",
    cursor: "pointer",
  },
} satisfies Record<string, React.CSSProperties>;
