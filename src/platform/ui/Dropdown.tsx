// The one select-like dropdown (David, 2 Nov 2026: "use custom controls for all select-like dropdowns to stay
// consistent"). A button showing the control's name and its choice opens a panel of radios (single) or
// checkboxes (multi). The panel is a labelled fieldset, so screen readers hear the group and each option's state.
// Escape or a click outside closes it; Escape puts the focus back on the button, as do a single choice and,
// in WebKit, which doesn't focus a clicked checkbox, an Escape with the focus on the page.
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { Icon } from "~/shell/icons";
import styles from "./Dropdown.module.css";

export interface DropdownOption<T extends string> {
  value: T;
  label: string;
  /** Why it can't be chosen now, shown beside it; it stays in the list so the player sees it exists. */
  disabledReason?: string | null;
  /** A swatch color, for options that are series in a chart. */
  color?: string;
}

interface Common<T extends string> {
  /** The control's name, shown in the button and as the panel's legend. */
  name: string;
  options: readonly DropdownOption<T>[];
  /** Overrides the button's summary of the choice. */
  summary?: string;
  /** Marks the button as filtering, as the filter bar's menus do when something is chosen. */
  active?: boolean;
  /** What the panel says when it has nothing to choose from. */
  empty?: ReactNode;
  /** Open the panel toward the button's right edge, near the edge of the screen. */
  align?: "start" | "end";
}
export type DropdownProps<T extends string> = Common<T> &
  ({ mode: "single"; value: T; onChange: (value: T) => void } | { mode: "multi"; values: readonly T[]; onChange: (values: T[]) => void });

export function Dropdown<T extends string>(props: DropdownProps<T>) {
  const { name, options, active, empty, align = "start" } = props;
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const chosen = props.mode === "single" ? [props.value] : props.values;

  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      const focus = document.activeElement;
      if (!focus || focus === document.body || root.current?.contains(focus)) button.current?.focus();
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const labels = options.filter((o) => chosen.includes(o.value)).map((o) => o.label);
  const summary = props.summary ?? (labels.length > 2 ? `${labels.length} selected` : labels.join(", "));

  return (
    <div className={styles.menu} ref={root}>
      <button
        ref={button}
        type="button"
        className={styles.button}
        data-active={active || undefined}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
      >
        <span className={styles.name}>{name}</span>
        <span className={styles.summary}>{summary}</span>
        <Icon name="chevronDown" size={16} />
      </button>
      <fieldset id={panelId} className={styles.panel} hidden={!open} data-align={align}>
        <legend className={styles.legend}>{name}</legend>
        {options.length === 0 && empty && <p className={styles.empty}>{empty}</p>}
        {options.map((option, i) => {
          const on = chosen.includes(option.value);
          const reason = option.disabledReason ?? null;
          const whyId = `${panelId}-why-${i}`;
          return (
            <label key={option.value} className={styles.option} data-disabled={(reason !== null && !on) || undefined}>
              <input
                type={props.mode === "single" ? "radio" : "checkbox"}
                name={props.mode === "single" ? panelId : undefined}
                checked={on}
                // A chosen option can always be unchosen unless it says why not; an unchosen one, only if it fits.
                disabled={reason !== null}
                aria-describedby={reason ? whyId : undefined}
                onChange={() => {
                  if (props.mode === "single") {
                    props.onChange(option.value);
                    setOpen(false);
                    button.current?.focus();
                  } else {
                    props.onChange(on ? props.values.filter((v) => v !== option.value) : [...props.values, option.value]);
                  }
                }}
              />
              {option.color && <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 3, background: option.color, flex: "none" }} />}
              <span>{option.label}</span>
              {reason && (
                <span id={whyId} className={styles.why}>
                  {reason}
                </span>
              )}
            </label>
          );
        })}
      </fieldset>
    </div>
  );
}
