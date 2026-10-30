import { useEffect, useId, useRef, useState } from "react";

import { Icon } from "~/shell/icons";
import { DIMENSION_LABELS, formatDimensionValue } from "./format";
import type { FilterOptions } from "./investigation.server";
import { FILTER_DIMENSIONS, type FilterDimension, type Filters } from "./state";
import styles from "./Investigate.module.css";

const MENUS = ["quarter", "genre", "format", "publisher"] as const satisfies readonly (keyof FilterOptions)[];

export interface FilterBarProps {
  filters: Filters;
  options: FilterOptions;
  onChange: (dimension: FilterDimension, values: string[]) => void;
  onClear: () => void;
}

/** One row of filters above everything they scope. */
export function FilterBar({ filters, options, onChange, onClear }: FilterBarProps) {
  const any = FILTER_DIMENSIONS.some((d) => filters[d]?.length);
  // Menus show their own selections; chips cover the rest (the heatmap's weekday and month).
  const chipped = FILTER_DIMENSIONS.filter((d) => !(MENUS as readonly string[]).includes(d) && filters[d]?.length);

  return (
    <div className={styles.filterBar} role="group" aria-label="Filters">
      <div className={styles.filterMenus}>
        <span className={styles.filterIcon}>
          <Icon name="filter" size={18} />
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
              Clear all
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}

function FilterMenu({
  dimension,
  options,
  selected,
  onChange,
}: {
  dimension: keyof FilterOptions;
  options: string[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
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

  const summary =
    selected.length === 0 ? "All" : selected.length === 1 ? formatDimensionValue(dimension, selected[0]) : `${selected.length} selected`;

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
