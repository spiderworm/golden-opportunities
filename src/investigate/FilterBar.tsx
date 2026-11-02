import { useEffect, useId, useRef, useState } from "react";

import { Icon } from "~/shell/icons";
import { DIMENSION_LABELS, formatDimensionValue } from "./format";
import type { FilterOptions } from "./investigation.server";
import { awardChoice, discountChoice, FILTER_DIMENSIONS, seriesChoice, type AwardChoice, type DiscountChoice, type FilterDimension, type Filters, type SeriesChoice } from "./state";
import styles from "./Investigate.module.css";

const MENUS = ["quarter", "genre", "format", "publisher"] as const satisfies readonly (keyof FilterOptions)[];
/** Dimensions with their own menu; the rest show as chips. */
/** The awards menu's two dimensions: one choice sets one of them. */
const AWARDS: readonly FilterDimension[] = ["awarded", "award"];
/** The series menu's two dimensions: one choice sets one of them. */
const SERIES: readonly FilterDimension[] = ["in_series", "volume"];
const IN_MENUS: readonly FilterDimension[] = [...MENUS, "discount_rate", "discounted", ...AWARDS, ...SERIES];
/** What a menu says when nothing in it is chosen (m1-copy section 2). */
const ALL: Record<(typeof MENUS)[number], string> = { quarter: "All quarters", genre: "All genres", format: "All formats", publisher: "All publishers" };

export interface FilterBarProps {
  filters: Filters;
  options: FilterOptions;
  onChange: (dimension: FilterDimension, values: string[]) => void;
  onDiscount: (choice: DiscountChoice) => void;
  onAward: (choice: AwardChoice) => void;
  onSeries: (choice: SeriesChoice) => void;
  onClear: () => void;
}

/** One row of filters above everything they scope. */
export function FilterBar({ filters, options, onChange, onDiscount, onAward, onSeries, onClear }: FilterBarProps) {
  const any = FILTER_DIMENSIONS.some((d) => filters[d]?.length);
  // Menus show their own selections; chips cover the rest (the heatmap's weekday and month), and a one-choice
  // menu's filters when no single choice names them (a link with both, or two awards or volumes).
  const unnamed: readonly FilterDimension[] = [
    ...(awardChoice(filters) === "all" ? AWARDS : []),
    ...(seriesChoice(filters) === "all" ? SERIES : []),
  ];
  const chipped = FILTER_DIMENSIONS.filter((d) => (!IN_MENUS.includes(d) || unnamed.includes(d)) && filters[d]?.length);

  return (
    <div className={styles.filterBar} role="group" aria-label="Filters">
      <div className={styles.filterMenus}>
        <span className={styles.filterIcon}>
          <Icon name="filter" size={18} />
          Only show
        </span>
        {MENUS.map((dimension) => (
          <FilterMenu
            key={dimension}
            dimension={dimension}
            options={options[dimension]}
            selected={filters[dimension] ?? []}
            onChange={(values) => onChange(dimension, values)}
          />
        ))}
        <DiscountMenu choice={discountChoice(filters)} rates={options.discount_rate} onChange={onDiscount} />
        <AwardMenu choice={awardChoice(filters)} awards={options.award} onChange={onAward} />
        <SeriesMenu choice={seriesChoice(filters)} volumes={options.volume} onChange={onSeries} />
      </div>
      {any && (
        <ul className={styles.chips} aria-label="Other filters">
          {chipped.flatMap((dimension) =>
            filters[dimension]!.map((value) => (
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
          <li>
            <button type="button" className={styles.clearAll} onClick={onClear}>
              Clear filters
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}

function usePopover() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return { open, setOpen, rootRef, panelId };
}

function FilterMenu({
  dimension,
  options,
  selected,
  onChange,
}: {
  dimension: (typeof MENUS)[number];
  options: string[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const { open, setOpen, rootRef, panelId } = usePopover();
  const summary =
    selected.length === 0 ? ALL[dimension] : selected.length === 1 ? formatDimensionValue(dimension, selected[0]) : `${selected.length} selected`;

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
        <span className={styles.filterName}>Series</span>
        <span className={styles.filterSummary}>{summary}</span>
        <Icon name="chevronDown" size={16} />
      </button>
      <fieldset id={panelId} className={styles.filterPanel} hidden={!open}>
        <legend className={styles.visuallyHidden}>Series</legend>
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
