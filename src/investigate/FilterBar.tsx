import { useRef, type RefObject } from "react";

import { Dropdown } from "~/platform/ui/Dropdown";
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
  price: "Price band",
  discount: "Discount",
  awards: "Awards",
  series: "Series volume",
  month: "Month",
  weekday: "Weekday",
  title: "Title",
  edition: "Edition",
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
  price_band: "Any price",
  edition: "Any edition",
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
    // An exact list price, from a drilldown: the Price menu chooses bands.
    ...(shown.includes("price") ? (["list_price"] as const) : []),
  ];

  const control = (id: FilterId) => {
    switch (id) {
      case "discount":
        return <DiscountMenu choice={discountChoice(filters)} rates={options.discount_rate} onChange={onDiscount} />;
      case "awards":
        return <AwardMenu choice={awardChoice(filters)} awards={options.award} onChange={onAward} />;
      case "series":
        return <SeriesMenu choice={seriesChoice(filters)} volumes={options.volume} onChange={onSeries} />;
      case "price":
        return (
          <FilterMenu dimension="price_band" options={options.price_band} selected={filters.price_band ?? []} onChange={(values) => onChange("price_band", values)} />
        );
      default: {
        // Titles and editions are too many to list: they come from a chart's drilldown.
        const choices =
          id === "month" ? monthsInScope(options.quarter) : id === "weekday" ? WEEKDAYS : id === "title" || id === "edition" ? (filters[id] ?? []) : options[id];
        return (
          <FilterMenu
            dimension={id}
            options={choices}
            selected={filters[id] ?? []}
            empty={id === "title" || id === "edition" ? `Choose ${id === "title" ? "a title" : "an edition"} from a chart broken down by ${FILTER_LABELS[id]}.` : undefined}
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
  return (
    <Dropdown
      mode="multi"
      name="Add a filter"
      legend="Filters on the bar"
      buttonRef={buttonRef}
      trigger={{
        className: styles.addFilter,
        content: (
          <>
            <span aria-hidden="true">+</span> Add a filter
          </>
        ),
      }}
      values={shown}
      options={FILTERS.map((id) => ({ value: id, label: FILTER_LABELS[id] }))}
      onChange={(next) => {
        const added = next.find((id) => !shown.includes(id));
        if (added) onAdd(added);
        else for (const id of shown.filter((id) => !next.includes(id))) onRemove(id);
      }}
    />
  );
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
  return (
    <Dropdown
      mode="multi"
      name={DIMENSION_LABELS[dimension]}
      summary={selected.length === 0 ? (ALL[dimension] ?? "All") : selected.length === 1 ? formatDimensionValue(dimension, selected[0]) : `${selected.length} selected`}
      active={selected.length > 0}
      empty={empty}
      values={selected}
      options={options.map((value) => ({ value, label: formatDimensionValue(dimension, value) }))}
      onChange={onChange}
    />
  );
}

/**
 * A one-choice menu whose choices aren't strings (an award, a volume): each is keyed for the dropdown, and the
 * key is mapped back to its choice.
 */
function ChoiceMenu<C>({ name, choices, choice, keyOf, onChange }: { name: string; choices: { value: C; label: string }[]; choice: C; keyOf: (c: C) => string; onChange: (choice: C) => void }) {
  const fallback = choices[0]!;
  const current = choices.find((c) => keyOf(c.value) === keyOf(choice)) ?? fallback;
  return (
    <Dropdown
      mode="single"
      name={name}
      summary={current.label}
      active={keyOf(choice) !== keyOf(fallback.value)}
      value={keyOf(current.value)}
      options={choices.map((c) => ({ value: keyOf(c.value), label: c.label }))}
      onChange={(key) => onChange(choices.find((c) => keyOf(c.value) === key)!.value)}
    />
  );
}

/** One choice: every sale, full price, any discount, or a single rate. */
function DiscountMenu({ choice, rates, onChange }: { choice: DiscountChoice; rates: string[]; onChange: (choice: DiscountChoice) => void }) {
  const choices: { value: DiscountChoice; label: string }[] = [
    { value: "all", label: "Any price" },
    { value: "full", label: "Full price" },
    { value: "any", label: "Any discount" },
    ...rates
      .filter((rate) => parseFloat(rate) !== 0)
      .map((rate) => ({ value: rate as DiscountChoice, label: formatDimensionValue("discount_rate", rate) })),
  ];
  return <ChoiceMenu name="Discount" choices={choices} choice={choice} keyOf={(c) => c} onChange={onChange} />;
}

/** One choice: every book, award winners, books without an award, or one award's winners. */
function AwardMenu({ choice, awards, onChange }: { choice: AwardChoice; awards: string[]; onChange: (choice: AwardChoice) => void }) {
  const choices: { value: AwardChoice; label: string }[] = [
    { value: "all", label: "Any book" },
    { value: "yes", label: formatDimensionValue("awarded", "yes") },
    { value: "no", label: formatDimensionValue("awarded", "no") },
    ...awards.map((award) => ({ value: { award }, label: award })),
  ];
  return <ChoiceMenu name="Awards" choices={choices} choice={choice} keyOf={(c) => (typeof c === "object" ? `award:${c.award}` : c)} onChange={onChange} />;
}

/** One choice: every book, books in a series, standalone books, or one volume number. */
function SeriesMenu({ choice, volumes, onChange }: { choice: SeriesChoice; volumes: string[]; onChange: (choice: SeriesChoice) => void }) {
  const choices: { value: SeriesChoice; label: string }[] = [
    { value: "all", label: "Any book" },
    { value: "yes", label: formatDimensionValue("in_series", "yes") },
    { value: "no", label: formatDimensionValue("in_series", "no") },
    ...volumes.map((volume) => ({ value: { volume }, label: formatDimensionValue("volume", volume) })),
  ];
  return <ChoiceMenu name="Series volume" choices={choices} choice={choice} keyOf={(c) => (typeof c === "object" ? `volume:${c.volume}` : c)} onChange={onChange} />;
}
