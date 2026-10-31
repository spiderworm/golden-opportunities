import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { DECIDE_Q2_COPY as COPY, editionLabel, MONTHS, type Month } from "./q2-copy";
import styles from "./PickPicker.module.css";

/** An edition the player can pick (Frank's loader, from Sim's q2Candidates): keyed by ISBN, since a title can have two of a format. */
export interface Candidate {
  isbn: string;
  /** The book, whatever the edition: a book can be picked once. Falls back to the title without it. */
  bookId?: string;
  title: string;
  format: string;
  listPrice: number;
}

export interface PickPickerProps {
  candidates: readonly Candidate[];
  /** April, May and June: an ISBN, or null for no pick. */
  picks: readonly (string | null)[];
  onPick: (month: number, isbn: string | null) => void;
  /** Tried to pick a book already picked for another month (the list refuses it). */
  onRefused?: (month: number) => void;
  disabled?: boolean;
}

const bookOf = (c: Candidate) => c.bookId ?? c.title;

/**
 * The Book of the Month calendar for Q2 (q2.md section 5): one row per month, each a button showing its pick
 * or "No pick". It opens a list over the scene, with a search field at its top, so opening it moves nothing.
 * A book picked for another month stays in the list, marked and refused, so a book can't be picked twice.
 */
export function PickPicker({ candidates, picks, onPick, onRefused, disabled }: PickPickerProps) {
  const id = useId();
  const [open, setOpen] = useState<number | null>(null);
  const byIsbn = useMemo(() => new Map(candidates.map((c) => [c.isbn, c])), [candidates]);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  const close = (month: number, focus: boolean) => {
    setOpen(null);
    if (focus) buttons.current[month]?.focus();
  };

  return (
    <div className={styles.calendar} role="group" aria-labelledby={`${id}-label`}>
      <p id={`${id}-label`} className={styles.label}>
        {COPY.picks.label}
      </p>
      {MONTHS.map((month, m) => {
        const pick = picks[m] ? byIsbn.get(picks[m]!) : undefined;
        return (
          <div key={month} className={styles.row} data-open={open === m || undefined}>
            <span id={`${id}-${m}-month`} className={styles.month}>
              {month}
            </span>
            <button
              ref={(el) => {
                buttons.current[m] = el;
              }}
              id={`${id}-${m}-pick`}
              type="button"
              className={styles.pick}
              data-empty={!pick || undefined}
              disabled={disabled}
              aria-labelledby={`${id}-${m}-month ${id}-${m}-pick`}
              aria-expanded={open === m}
              aria-controls={`${id}-${m}-popup`}
              onClick={() => setOpen(open === m ? null : m)}
            >
              {pick ? editionLabel(pick) : COPY.picks.none}
            </button>
            {open === m && (
              <Choices
                id={`${id}-${m}`}
                month={month}
                candidates={candidates}
                chosen={picks[m] ?? null}
                taken={takenBy(picks, m, byIsbn)}
                onChoose={(isbn) => {
                  onPick(m, isbn);
                  close(m, true);
                }}
                onRefused={() => onRefused?.(m)}
                onClose={(focus) => close(m, focus)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** The books picked for the other months, and for which month: they can't be picked again. */
function takenBy(picks: readonly (string | null)[], month: number, byIsbn: ReadonlyMap<string, Candidate>): Map<string, Month> {
  const taken = new Map<string, Month>();
  picks.forEach((isbn, m) => {
    const c = isbn && m !== month ? byIsbn.get(isbn) : undefined;
    if (c) taken.set(bookOf(c), MONTHS[m]!);
  });
  return taken;
}

interface ChoicesProps {
  id: string;
  month: Month;
  candidates: readonly Candidate[];
  chosen: string | null;
  taken: ReadonlyMap<string, Month>;
  onChoose: (isbn: string | null) => void;
  onRefused: () => void;
  onClose: (focus: boolean) => void;
}

/** The list for one month: a search field (an ARIA combobox) over "No pick" and every edition that matches. */
function Choices({ id, month, candidates, chosen, taken, onChoose, onRefused, onClose }: ChoicesProps) {
  const [query, setQuery] = useState("");
  const words = query.trim().toLowerCase();
  const shown = useMemo(
    () => (words ? candidates.filter((c) => editionLabel(c).toLowerCase().includes(words)) : candidates),
    [candidates, words],
  );
  // "No pick" first (as option -1), then the editions shown; the active one starts at the current choice.
  const [active, setActive] = useState(() => (chosen ? Math.max(-1, shown.findIndex((c) => c.isbn === chosen)) : -1));
  const list = useRef<HTMLUListElement>(null);
  const optionId = (i: number) => `${id}-option-${i < 0 ? "none" : shown[i]!.isbn}`;

  useEffect(() => {
    list.current?.querySelector(`[id="${CSS.escape(optionId(active))}"]`)?.scrollIntoView({ block: "nearest" });
  });

  function choose(i: number) {
    if (i < 0) return onChoose(null);
    const c = shown[i]!;
    if (taken.has(bookOf(c))) return onRefused();
    onChoose(c.isbn);
  }

  function onKeyDown(event: KeyboardEvent) {
    const last = shown.length - 1;
    if (event.key === "ArrowDown") setActive(Math.min(last, active + 1));
    else if (event.key === "ArrowUp") setActive(Math.max(-1, active - 1));
    else if (event.key === "Home" && event.ctrlKey) setActive(-1);
    else if (event.key === "End" && event.ctrlKey) setActive(last);
    else if (event.key === "Enter") choose(active);
    else if (event.key === "Escape") {
      // The form's own Escape (a pinned move's line) waits for the next press.
      event.stopPropagation();
      onClose(true);
    } else return;
    event.preventDefault();
  }

  return (
    <div
      id={`${id}-popup`}
      className={styles.popup}
      onBlur={(event) => !event.currentTarget.contains(event.relatedTarget as Node | null) && onClose(false)}
    >
      <input
        className={styles.search}
        type="search"
        role="combobox"
        autoFocus
        autoComplete="off"
        spellCheck={false}
        placeholder={COPY.picks.search}
        aria-label={`${COPY.picks.search}: ${month}`}
        aria-autocomplete="list"
        aria-expanded="true"
        aria-controls={`${id}-list`}
        aria-activedescendant={optionId(active)}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(event.target.value.trim() ? 0 : -1);
        }}
        onKeyDown={onKeyDown}
      />
      <ul ref={list} id={`${id}-list`} className={styles.list} role="listbox" aria-label={month}>
        <li
          id={optionId(-1)}
          role="option"
          className={styles.option}
          aria-selected={chosen === null}
          data-active={active === -1 || undefined}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => choose(-1)}
        >
          {COPY.picks.none}
        </li>
        {shown.map((c, i) => {
          const elsewhere = taken.get(bookOf(c));
          return (
            <li
              key={c.isbn}
              id={optionId(i)}
              role="option"
              className={styles.option}
              aria-selected={chosen === c.isbn}
              aria-disabled={elsewhere ? true : undefined}
              data-active={active === i || undefined}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(i)}
            >
              {editionLabel(c)}
              {elsewhere && <span className={styles.taken}> {COPY.picks.taken(elsewhere)}</span>}
            </li>
          );
        })}
        {shown.length === 0 && (
          <li className={styles.nothing} role="presentation">
            {COPY.picks.nothing}
          </li>
        )}
      </ul>
    </div>
  );
}
