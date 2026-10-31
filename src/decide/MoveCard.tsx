import { useState } from "react";

import { DECIDE_COPY as COPY, type MOVES } from "./copy";
import styles from "./Decide.module.css";

type Move = (typeof MOVES)[number];

/** The move whose full line shows over the scene: peeked by hover or focus, or pinned by its "more" button. */
export function useMoreLine() {
  const [more, setMore] = useState<{ id: string; pinned: boolean } | null>(null);
  return {
    more,
    peek: (id: string) => setMore((m) => (m?.pinned ? m : { id, pinned: false })),
    unpeek: (id: string) => setMore((m) => (m && m.id === id && !m.pinned ? null : m)),
    toggle: (id: string) => setMore((m) => (m?.id === id && m.pinned ? null : { id, pinned: true })),
    clear: () => setMore(null),
  };
}

export interface MoveCardProps {
  move: Move;
  /** Its number on the form, from 1. */
  number: number;
  selected: boolean;
  onToggle: () => void;
  line: ReturnType<typeof useMoreLine>;
}

/** A move on the requisition form: a checkbox with its title and key figure, its line, "More", and the bosses' stamp. */
export function MoveCard({ move: m, number, selected, onToggle, line }: MoveCardProps) {
  const { more } = line;
  return (
    <div
      className={styles.option}
      data-selected={selected || undefined}
      data-more={more?.id === m.id || undefined}
      onMouseEnter={() => line.peek(m.id)}
      onMouseLeave={() => line.unpeek(m.id)}
      onFocus={() => line.peek(m.id)}
      onBlur={(event) => !event.currentTarget.contains(event.relatedTarget as Node | null) && line.clear()}
      onKeyDown={(event) => event.key === "Escape" && more && (event.stopPropagation(), line.clear())}
    >
      <span className={styles.itemNumber} aria-hidden="true">
        {String(number).padStart(2, "0")}
      </span>
      <label className={styles.optionLabel}>
        <input type="checkbox" name="levers" value={m.id} checked={selected} onChange={onToggle} aria-describedby={`move-line-${m.id}`} />
        <span className={styles.optionTitle}>{m.title}</span>
        {m.figure && <span className={styles.optionFigure}>{m.figure}</span>}
      </label>
      {/* The whole line, clamped to two at rest; it describes the checkbox, so screen readers get all of it. */}
      <p id={`move-line-${m.id}`} className={styles.optionLine}>
        {m.line}
      </p>
      <button
        type="button"
        className={styles.more}
        aria-expanded={more?.id === m.id && more.pinned}
        aria-controls={`move-more-${m.id}`}
        onClick={() => line.toggle(m.id)}
      >
        {more?.id === m.id && more.pinned ? COPY.less : COPY.more}
        {/* Its name starts with what it says ("More about ..."), so voice control can use it (WCAG 2.5.3). */}
        <span className={styles.visuallyHidden}>
          {" "}
          {COPY.moreAbout} {m.title}
        </span>
      </button>
      {/* The full line over the scene on hover, focus or a tap on "more": it overlays, so nothing moves. */}
      <div id={`move-more-${m.id}`} className={styles.popover} aria-hidden="true">
        {m.line}
      </div>
      {/* The bosses' stamp on a chosen move: its space is always kept, so stamping moves nothing. */}
      <span className={styles.stamp} aria-hidden="true">
        {COPY.form.stamp}
      </span>
    </div>
  );
}
