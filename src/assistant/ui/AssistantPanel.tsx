// The chat panel: ask the station's reference assistant about the data. Replies stream in; every lookup it ran
// is shown under the reply with its source, so a figure without a source stands out. Minimal for now: results
// are tables until the dashboard's chart components can draw them.

import { useEffect, useRef, useState } from "react";
import { useRouteLoaderData } from "react-router";
import type { WireEvent } from "../events.ts";
import { track as platformTrack } from "~/platform/analytics/analytics.client";
import { ASSISTANT_NAME as NAME } from "../name.ts";
import type { ChartSpec } from "../tools/definitions.ts";
import { browserStorage, clearConversation, historyFor, INTERRUPTED, loadConversation, saveConversation } from "./conversation.ts";
import { askAssistant } from "./stream.ts";

/** The platform's track(); injectable for tests. */
export type PanelTrack = (event: string, props?: Record<string, string | number | boolean>, options?: { hold?: "agent_text" }) => void;

/** A pin also records whether the page took it (the dashboard can refuse a spec, or there may be none). */
type Lookup = Extract<WireEvent, { type: "data" | "comparison" | "lookup_failed" }> | (Extract<WireEvent, { type: "pin" }> & { placed: boolean });
interface Reply {
  question: string;
  text: string;
  lookups: Lookup[];
  error?: string;
  state: "streaming" | "done" | "stopped" | "failed" | typeof INTERRUPTED;
}

/** While an answer streams, the conversation is saved at most this often. */
const SAVE_EVERY_MS = 1_000;

const QUESTION_MAX = 500;
const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

export function AssistantPanel({
  track = platformTrack,
  onPin,
  fetcher,
  storage = browserStorage(),
  instance,
}: {
  track?: PanelTrack;
  onPin?: (chart: ChartSpec) => boolean | void;
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
      setReplies(saved);
      track("assistant_conversation_restored", { turns: saved.length, interrupted: saved.some((r) => r.state === INTERRUPTED) });
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
  const busy = replies.at(-1)?.state === "streaming";

  // Starting over bumps the conversation, so an answer still winding down can't write into the new one.
  const conversation = useRef(0);
  const updater = (mine: number) => (change: (r: Reply) => Reply) => setReplies((rs) => (conversation.current !== mine || !rs.length ? rs : [...rs.slice(0, -1), change(rs[rs.length - 1])]));

  async function send() {
    const text = question.trim();
    if (!text || busy) return;
    // What players type stays on the device (David, 30 Oct); only its length is sent.
    track("agent_asked", { text, chars: text.length }, { hold: "agent_text" });
    track("assistant_question_sent", { chars: text.length, turn: replies.length });
    const history = historyFor(replies);
    const update = updater(conversation.current);
    setQuestion("");
    setReplies((rs) => [...rs, { question: text, text: "", lookups: [], state: "streaming" }]);
    const controller = new AbortController();
    abort.current = controller;
    const started = performance.now();
    let outcome = "done";
    try {
      for await (const event of askAssistant(text, history.slice(-6), onPin !== undefined, controller.signal, fetcher)) {
        if (event.type === "text") update((r) => ({ ...r, text: r.text + event.text }));
        else if (event.type === "data" || event.type === "comparison" || event.type === "lookup_failed") update((r) => ({ ...r, lookups: [...r.lookups, event] }));
        else if (event.type === "pin" && onPin) {
          // Pins are only offered when onPin is wired; the page can still refuse one (Chart's pins.add).
          const placed = onPin(event.chart) !== false;
          track("assistant_pin_placed", { placed, kind: event.chart.kind });
          update((r) => ({ ...r, lookups: [...r.lookups, { ...event, placed }] }));
        } else if (event.type === "error") {
          outcome = "failed";
          update((r) => ({ ...r, error: event.message }));
        }
      }
    } catch (e) {
      outcome = controller.signal.aborted ? "stopped" : "failed";
      if (!controller.signal.aborted) update((r) => ({ ...r, error: "The connection to the assistant dropped." }));
    } finally {
      update((r) => ({ ...r, state: outcome === "done" ? "done" : outcome === "stopped" ? "stopped" : "failed" }));
      track("assistant_reply_shown", { outcome, durationMs: Math.round(performance.now() - started) });
      if (abort.current === controller) abort.current = null;
    }
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
      <div ref={log} style={styles.log} aria-live="polite">
        {replies.length === 0 && <p style={styles.muted}>Ask about your sales: a figure, a breakdown, a term. {NAME} looks things up; what they mean is up to you.</p>}
        {replies.map((r, i) => (
          <article key={i} style={styles.turn}>
            <p style={styles.question}>{r.question}</p>
            {r.text && <p style={styles.answer}>{r.text}</p>}
            {r.state === "streaming" && !r.text && <p style={styles.muted}>Looking...</p>}
            {r.lookups.map((l, j) => (
              <LookupView key={j} lookup={l} />
            ))}
            {r.error && <p style={styles.error}>{r.error}</p>}
            {r.state === "stopped" && <p style={styles.muted}>Stopped.</p>}
            {r.state === INTERRUPTED && <p style={styles.muted}>Interrupted: this answer stopped when the page was reloaded or closed, before it finished.</p>}
          </article>
        ))}
      </div>
      <form
        style={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          aria-label={`Question for ${NAME}`}
          value={question}
          maxLength={QUESTION_MAX}
          placeholder="What was revenue by quarter?"
          onChange={(e) => setQuestion(e.target.value)}
          style={styles.input}
        />
        {busy ? (
          <button type="button" style={styles.button} onClick={() => abort.current?.abort()}>
            Stop
          </button>
        ) : (
          <button type="submit" style={styles.button} disabled={!question.trim()}>
            Ask
          </button>
        )}
      </form>
    </section>
  );
}

function LookupView({ lookup }: { lookup: Lookup }) {
  if (lookup.type === "lookup_failed") return <p style={styles.muted}>A lookup didn't work: {lookup.message}</p>;
  if (lookup.type === "pin") {
    return (
      <figure style={styles.lookup}>
        <figcaption>{lookup.placed ? `Pinned to Investigate, below: ${lookup.chart.title}` : `Couldn't pin that chart: ${lookup.chart.title}`}</figcaption>
        <p style={styles.source}>Source: {lookup.source}</p>
      </figure>
    );
  }
  // Every row, in a scrolling box: a reply's figures can come from any row, so none may be cut off.
  const shown: Record<string, unknown>[] = lookup.rows;
  const cell = (v: unknown) => (v === null || v === undefined ? "Unknown" : typeof v === "number" ? number.format(v) : String(v));
  // A comparison's overall figures go in a last row; a breakdown's rows come first.
  const breakdown = lookup.type === "comparison" ? lookup.columns.find((c) => c.type === "string") : undefined;
  const totalRow: Record<string, unknown> | null = lookup.type === "comparison" ? { ...(breakdown ? { [breakdown.key]: "All" } : {}), ...lookup.total } : null;
  return (
    <figure style={styles.lookup}>
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
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {lookup.type === "data" && lookup.total !== null && lookup.columns.length > 1 && <p style={styles.muted}>Total: {number.format(lookup.total)}</p>}
      <p style={styles.source}>Source: {lookup.source}</p>
    </figure>
  );
}

const styles = {
  panel: { display: "flex", flexDirection: "column", gap: 12, maxWidth: 520, padding: 16, background: "var(--color-panel)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-panel)", color: "var(--color-text)", fontFamily: "var(--font-body)" },
  header: { display: "flex", alignItems: "baseline", gap: 8 },
  quiet: { marginLeft: "auto", padding: "2px 8px", background: "none", color: "var(--color-text-muted)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-control)", cursor: "pointer", fontSize: 12 },
  muted: { color: "var(--color-text-muted)", margin: 0, fontSize: 13 },
  log: { display: "flex", flexDirection: "column", gap: 16, maxHeight: 480, overflowY: "auto" },
  turn: { display: "flex", flexDirection: "column", gap: 8 },
  question: { margin: 0, alignSelf: "flex-end", background: "var(--color-accent-soft)", padding: "6px 10px", borderRadius: "var(--radius-control)" },
  answer: { margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.5 },
  error: { margin: 0, color: "var(--color-down)" },
  lookup: { margin: 0, padding: 10, background: "var(--color-panel-raised)", borderRadius: "var(--radius-control)" },
  table: { borderCollapse: "collapse", width: "100%", fontSize: 13 },
  rows: { maxHeight: 240, overflowY: "auto" },
  th: { textAlign: "left", color: "var(--color-text-muted)", fontWeight: 500, padding: "2px 8px 4px 0", position: "sticky", top: 0, background: "var(--color-panel-raised)" },
  td: { padding: "2px 8px 2px 0" },
  num: { padding: "2px 8px 2px 0", textAlign: "right", fontVariantNumeric: "tabular-nums" },
  source: { margin: "6px 0 0", color: "var(--color-text-muted)", fontSize: 12 },
  form: { display: "flex", gap: 8 },
  input: { flex: 1, padding: "8px 10px", background: "var(--color-space)", color: "var(--color-text)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-control)" },
  button: { padding: "8px 14px", background: "var(--color-accent)", color: "var(--color-text)", border: "none", borderRadius: "var(--radius-control)", cursor: "pointer" },
} satisfies Record<string, React.CSSProperties>;
