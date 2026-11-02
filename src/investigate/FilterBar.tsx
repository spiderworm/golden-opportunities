import { useEffect, useId, useRef, useState, type RefObject } from "react";

import { Icon } from "~/shell/icons";
import { DIMENSION_LABELS, formatDimensionValue } from "./format";
import type { FilterOptions } from "./investigation.server";
import {
  awardChoice,
  discountChoice,
  FILTER_PARTS,
  FILTERS,
  monthsInScope,
  seriesChoice,
  type AwardChoice,
  type DiscountChoice,
  type FilterDimension,
  type FilterId,
  type Filters,
  type SeriesChoice,
} from "./state";
import styles from "./Investigate.module.css";

/** Each filter's name, in the list and on the bar. */
export const FILTER_LABELS: Record<FilterId, string> = {
  quarter: "Quarter",
  genre: "Genre",
  format: "Format",
  publisher: "Publisher",
  discount: "Discount",
  awards: "Awards",
  series: "Series volume",
  month: "Month",
  weekday: "Weekday",
  title: "Title",
};

/** What a menu says when nothing in it is chosen (m1-copy section 2). */
const ALL: Partial<Record<FilterDimension, string>> = {
  quarter: "All quarters",
  genre: "All genres",
  format: "All formats",
  publisher: "All publishers",
  month: "All months",
  weekday: "All weekdays",
  title: "Any title",
};

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export interface FilterBarProps {
  filters: Filters;
  options: FilterOptions;
  /** The filters on the bar (state.ts, shownFilters). */
  shown: readonly FilterId[];
  onAdd: (id: FilterId) => void;
  onRemove: (id: FilterId) => void;
  onChange: (dimension: FilterDimension, values: string[]) => void;
  onDiscount: (choice: DiscountChoice) => void;
  onAward: (choice: AwardChoice) => void;
  onSeries: (choice: SeriesChoice) => void;
  onClear: () => void;
}

/**
 * One row of filters above everything they scope: only the ones the player has added, each with its own control
 * and an "x" to take it off, then "Add a filter" (David, 2 Nov 2026).
 */
export function FilterBar({ filters, options, shown, onAdd, onRemove, onChange, onDiscount, onAward, onSeries, onClear }: FilterBarProps) {
  const addButton = useRef<HTMLButtonElement>(null);
  const any = FILTERS.some((id) => FILTER_PARTS[id].some((d) => filters[d]?.length));
  // A one-choice menu's filters that no single choice names (a link with both, or two awards or volumes) show as
  // chips too, so nothing applies unseen.
  const unnamed: readonly FilterDimension[] = [
    ...(shown.includes("awards") && awardChoice(filters) === "all" ? FILTER_PARTS.awards : []),
    ...(shown.includes("series") && seriesChoice(filters) === "all" ? FILTER_PARTS.series : []),
  ];

  const control = (id: FilterId) => {
    switch (id) {
      case "discount":
        return <DiscountMenu choice={discountChoice(filters)} rates={options.discount_rate} onChange={onDiscount} />;
      case "awards":
        return <AwardMenu choice={awardChoice(filters)} awards={options.award} onChange={onAward} />;
      case "series":
        return <SeriesMenu choice={seriesChoice(filters)} volumes={options.volume} onChange={onSeries} />;
      default: {
        const choices = id === "month" ? monthsInScope(options.quarter) : id === "weekday" ? WEEKDAYS : id === "title" ? (filters.title ?? []) : options[id];
        return (
          <FilterMenu
            dimension={id}
            options={choices}
            selected={filters[id] ?? []}
            empty={id === "title" ? "Choose a title from a chart broken down by Title." : undefined}
            onChange={(values) => onChange(id, values)}
          />
        );
      }
    }
  };

  return (
    <div className={styles.filterBar} role="group" aria-label="Filters">
      <div className={styles.filterMenus}>
        <span className={styles.filterIcon}>
          <Icon name="filter" size={18} />
          Only show
        </span>
        {shown.map((id) => (
          <div key={id} className={styles.filterItem}>
            {control(id)}
            <button
              type="button"
              className={styles.filterRemove}
              aria-label={`Remove the ${FILTER_LABELS[id]} filter`}
              onClick={() => {
                // The filter's own button goes away: the focus goes to "Add a filter".
                addButton.current?.focus();
                onRemove(id);
              }}
            >
              <Icon name="close" size={14} />
            </button>
          </div>
        ))}
        <AddFilter buttonRef={addButton} shown={shown} onAdd={onAdd} onRemove={onRemove} />
        {any && (
          <button type="button" className={styles.clearAll} onClick={onClear}>
            Clear filters
          </button>
        )}
      </div>
      {unnamed.some((d) => filters[d]?.length) && (
        <ul className={styles.chips} aria-label="Other filters">
          {unnamed.flatMap((dimension) =>
            (filters[dimension] ?? []).map((value) => (
              <li key={`${dimension}:${value}`} className={styles.chip}>
                <span className={styles.chipDimension}>{DIMENSION_LABELS[dimension]}</span>
                {formatDimensionValue(dimension, value)}
                <button
                  type="button"
                  className={styles.chipRemove}
                  aria-label={`Remove ${DIMENSION_LABELS[dimension]} ${formatDimensionValue(dimension, value)}`}
                  onClick={() => onChange(dimension, filters[dimension]!.filter((v) => v !== value))}
                >
                  <Icon name="close" size={14} />
                </button>
              </li>
            )),
          )}
        </ul>
      )}
    </div>
  );
}

/** "Add a filter": a checkbox for every filter; checking one puts it on the bar, unchecking takes it off. */
function AddFilter({
  buttonRef,
  shown,
  onAdd,
  onRemove,
}: {
  buttonRef: RefObject<HTMLButtonElement | null>;
  shown: readonly FilterId[];
  onAdd: (id: FilterId) => void;
  onRemove: (id: FilterId) => void;
}) {
  const { open, setOpen, rootRef, panelId } = usePopover(buttonRef);
  return (
    <div className={styles.filterMenu} ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.addFilter}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
      >
        <span aria-hidden="true">+</span> Add a filter
      </button>
      <fieldset id={panelId} className={styles.filterPanel} hidden={!open}>
        <legend className={styles.visuallyHidden}>Filters on the bar</legend>
        {FILTERS.map((id) => (
          <label key={id} className={styles.filterOption}>
            <input type="checkbox" checked={shown.includes(id)} onChange={(e) => (e.target.checked ? onAdd(id) : onRemove(id))} />
            {FILTER_LABELS[id]}
          </label>
        ))}
      </fieldset>
    </div>
  );
}

/**
 * A popover's open state. Escape or a click outside closes it. Escape puts the focus back on its button when the
 * focus was in it, or nowhere: WebKit doesn't focus a checkbox that's clicked, which leaves the focus on the page.
 */
function usePopover(buttonRef?: RefObject<HTMLButtonElement | null>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      const focus = document.activeElement;
      if (!focus || focus === document.body || rootRef.current?.contains(focus)) (buttonRef?.current ?? rootRef.current?.querySelector("button"))?.focus();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, buttonRef]);

  return { open, setOpen, rootRef, panelId };
}

function FilterMenu({
  dimension,
  options,
  selected,
  empty,
  onChange,
}: {
  dimension: FilterDimension;
  options: readonly string[];
  selected: string[];
  /** What the menu says when it has nothing to choose from. */
  empty?: string;
  onChange: (values: string[]) => void;
}) {
  const { open, setOpen, rootRef, panelId } = usePopover();
  const summary =
    selected.length === 0 ? (ALL[dimension] ?? "All") : selected.length === 1 ? formatDimensionValue(dimension, selected[0]) : `${selected.length} selected`;

  return (
    <div className={styles.filterMenu} ref={rootRef}>
      <button
        type="button"
        className={styles.filterButton}
        data-active={selected.length > 0 || undefined}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
      >
        <span className={styles.filterName}>{DIMENSION_LABELS[dimension]}</span>
        <span className={styles.filterSummary}>{summary}</span>
        <Icon name="chevronDown" size={16} />
      </button>
      <fieldset id={panelId} className={styles.filterPanel} hidden={!open}>
        <legend className={styles.visuallyHidden}>{DIMENSION_LABELS[dimension]}</legend>
        {options.length === 0 && empty && <p className={styles.filterEmpty}>{empty}</p>}
        {options.map((value) => (
          <label key={value} className={styles.filterOption}>
            <input
              type="checkbox"
              checked={selected.includes(value)}
              onChange={(e) => onChange(e.target.checked ? [...selected, value] : selected.filter((v) => v !== value))}
            />
            {formatDimensionValue(dimension, value)}
          </label>
        ))}
      </fieldset>
    </div>
  );
}

/** One choice: every sale, full price, any discount, or a single rate. */
function DiscountMenu({ choice, rates, onChange }: { choice: DiscountChoice; rates: string[]; onChange: (choice: DiscountChoice) => void }) {
  const { open, setOpen, rootRef, panelId } = usePopover();
  const choices: { value: DiscountChoice; label: string }[] = [
    { value: "all", label: "Any price" },
    { value: "full", label: "Full price" },
    { value: "any", label: "Any discount" },
    ...rates
      .filter((rate) => parseFloat(rate) !== 0)
      .map((rate) => ({ value: rate as DiscountChoice, label: formatDimensionValue("discount_rate", rate) })),
  ];
  const summary = choices.find((c) => c.value === choice)?.label ?? "Any price";

  return (
    <div className={styles.filterMenu} ref={rootRef}>
      <button
        type="button"
        className={styles.filterButton}
        data-active={choice !== "all" || undefined}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
      >
        <span className={styles.filterName}>Discount</span>
        <span className={styles.filterSummary}>{summary}</span>
        <Icon name="chevronDown" size={16} />
      </button>
      <fieldset id={panelId} className={styles.filterPanel} hidden={!open}>
        <legend className={styles.visuallyHidden}>Discount</legend>
        {choices.map((c) => (
          <label key={c.value} className={styles.filterOption}>
            <input
              type="radio"
              name={panelId}
              checked={choice === c.value}
              onChange={() => {
                onChange(c.value);
                setOpen(false);
              }}
            />
            {c.label}
          </label>
        ))}
      </fieldset>
    </div>
  );
}

/** One choice: every book, award winners, books without an award, or one award's winners. */
function AwardMenu({ choice, awards, onChange }: { choice: AwardChoice; awards: string[]; onChange: (choice: AwardChoice) => void }) {
  const { open, setOpen, rootRef, panelId } = usePopover();
  const key = (c: AwardChoice) => (typeof c === "object" ? `award:${c.award}` : c);
  const choices: { value: AwardChoice; label: string }[] = [
    { value: "all", label: "Any book" },
    { value: "yes", label: formatDimensionValue("awarded", "yes") },
    { value: "no", label: formatDimensionValue("awarded", "no") },
    ...awards.map((award) => ({ value: { award }, label: award })),
  ];
  const summary = choices.find((c) => key(c.value) === key(choice))?.label ?? "Any book";

  return (
    <div className={styles.filterMenu} ref={rootRef}>
      <button
        type="button"
        className={styles.filterButton}
        data-active={choice !== "all" || undefined}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
      >
        <span className={styles.filterName}>Awards</span>
        <span className={styles.filterSummary}>{summary}</span>
        <Icon name="chevronDown" size={16} />
      </button>
      <fieldset id={panelId} className={styles.filterPanel} hidden={!open}>
        <legend className={styles.visuallyHidden}>Awards</legend>
        {choices.map((c) => (
          <label key={key(c.value)} className={styles.filterOption}>
            <input
              type="radio"
              name={panelId}
              checked={key(choice) === key(c.value)}
              onChange={() => {
                onChange(c.value);
                setOpen(false);
              }}
            />
            {c.label}
          </label>
        ))}
      </fieldset>
    </div>
  );
}

/** One choice: every book, books in a series, standalone books, or one volume number. */
function SeriesMenu({ choice, volumes, onChange }: { choice: SeriesChoice; volumes: string[]; onChange: (choice: SeriesChoice) => void }) {
  const { open, setOpen, rootRef, panelId } = usePopover();
  const key = (c: SeriesChoice) => (typeof c === "object" ? `volume:${c.volume}` : c);
  const choices: { value: SeriesChoice; label: string }[] = [
    { value: "all", label: "Any book" },
    { value: "yes", label: formatDimensionValue("in_series", "yes") },
    { value: "no", label: formatDimensionValue("in_series", "no") },
    ...volumes.map((volume) => ({ value: { volume }, label: formatDimensionValue("volume", volume) })),
  ];
  const summary = choices.find((c) => key(c.value) === key(choice))?.label ?? "Any book";

  return (
    <div className={styles.filterMenu} ref={rootRef}>
      <button
        type="button"
        className={styles.filterButton}
        data-active={choice !== "all" || undefined}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
      >
        <span className={styles.filterName}>Series volume</span>
        <span className={styles.filterSummary}>{summary}</span>
        <Icon name="chevronDown" size={16} />
      </button>
      <fieldset id={panelId} className={styles.filterPanel} hidden={!open}>
        <legend className={styles.visuallyHidden}>Series volume</legend>
        {choices.map((c) => (
          <label key={key(c.value)} className={styles.filterOption}>
            <input
              type="radio"
              name={panelId}
              checked={key(choice) === key(c.value)}
              onChange={() => {
                onChange(c.value);
                setOpen(false);
              }}
            />
            {c.label}
          </label>
        ))}
      </fieldset>
    </div>
  );
}
