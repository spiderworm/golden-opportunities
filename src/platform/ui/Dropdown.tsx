// The one select-like dropdown (David, 2 Nov 2026: "use custom controls for all select-like dropdowns to stay
// consistent"). A button showing the control's name and its choice opens a panel of radios (single) or
// checkboxes (multi). The panel is a labelled fieldset, so screen readers hear the group and each option's state.
// Escape or a click outside closes it; Escape puts the focus back on the button, as do a single choice and,
// in WebKit, which doesn't focus a clicked checkbox, an Escape with the focus on the page.
//
// ToggleMenu is the same button and panel holding a chart's switches (David, 3 Nov 2026: "Create an "Options"
// dropdown and put "Compare quarters", "vs same quarter last year", and "Scatter plot" into it"): a menu of
// menuitemcheckboxes, each showing whether it's on, that stays open as they're switched.
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

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
  /** Replaces the button's name and summary, for a button that is an action ("+ Add a filter"). */
  trigger?: { content: ReactNode; className: string };
  /** The panel's legend, when it isn't the name. */
  legend?: string;
  /** The button, for a caller that moves the focus to it. */
  buttonRef?: RefObject<HTMLButtonElement | null>;
}
export type DropdownProps<T extends string> = Common<T> &
  (
    | { mode: "single"; value: T; onChange: (value: T) => void }
    | { mode: "multi"; values: readonly T[]; onChange: (values: T[]) => void }
  );

/** Open or shut, shutting on a click outside, and on Escape, which puts the focus back on the button. */
function usePanel(button: RefObject<HTMLButtonElement | null>) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      const focus = document.activeElement;
      if (!focus || focus === document.body || root.current?.contains(focus))
        button.current?.focus();
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return { open, setOpen, root };
}

export function Dropdown<T extends string>(props: DropdownProps<T>) {
  const { name, options, active, empty, align = "start", trigger, legend = name } = props;
  const ownButton = useRef<HTMLButtonElement>(null);
  const button = props.buttonRef ?? ownButton;
  const { open, setOpen, root } = usePanel(button);
  const panelId = useId();
  // A choice shows at once, though its caller may only take it when a navigation lands: until the props change.
  const given = props.mode === "single" ? [props.value] : props.values;
  const [pending, setPending] = useState<readonly T[] | null>(null);
  useEffect(() => setPending(null), [given.join("\u0000")]);
  const chosen = pending ?? given;

  const labels = options.filter((o) => chosen.includes(o.value)).map((o) => o.label);
  const summary =
    props.summary ?? (labels.length > 2 ? `${labels.length} selected` : labels.join(", "));

  return (
    <div className={styles.menu} ref={root}>
      <button
        ref={button}
        type="button"
        className={trigger?.className ?? styles.button}
        data-active={active || undefined}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
      >
        {trigger ? (
          trigger.content
        ) : (
          <>
            <span className={styles.name}>{name}</span>
            <span className={styles.summary}>{summary}</span>
            <Icon name="chevronDown" size={16} />
          </>
        )}
      </button>
      <fieldset id={panelId} className={styles.panel} hidden={!open} data-align={align}>
        <legend className={styles.legend}>{legend}</legend>
        {options.length === 0 && empty && <p className={styles.empty}>{empty}</p>}
        {options.map((option, i) => {
          const on = chosen.includes(option.value);
          const reason = option.disabledReason ?? null;
          const whyId = `${panelId}-why-${i}`;
          return (
            <label
              key={option.value}
              className={styles.option}
              data-disabled={(reason !== null && !on) || undefined}
            >
              <input
                type={props.mode === "single" ? "radio" : "checkbox"}
                name={props.mode === "single" ? panelId : undefined}
                checked={on}
                // A chosen option can always be unchosen unless it says why not; an unchosen one, only if it fits.
                disabled={reason !== null}
                aria-describedby={reason ? whyId : undefined}
                onChange={() => {
                  if (props.mode === "single") {
                    setPending([option.value]);
                    props.onChange(option.value);
                    setOpen(false);
                    button.current?.focus();
                  } else {
                    const next = on
                      ? chosen.filter((v) => v !== option.value)
                      : [...chosen, option.value];
                    setPending(next);
                    props.onChange(next);
                  }
                }}
              />
              {option.color && (
                <span
                  aria-hidden="true"
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 3,
                    background: option.color,
                    flex: "none",
                  }}
                />
              )}
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

export interface MenuToggle {
  /** Stable among the menu's items. */
  key: string;
  label: string;
  on: boolean;
  /** Why it can't be switched now, shown under it; it stays in the menu, focusable, so the player sees it exists. */
  reason?: string | null;
  /** What it does, as its tooltip while it can be switched. */
  hint?: string;
  /** A sub-item of the one before, indented under it. */
  under?: boolean;
  onToggle: () => void;
}

/**
 * A button that opens a menu of switches. Its button counts the ones on ("View", "1 on", heard as "View, 1 on"), so a chart's state
 * isn't hidden behind it. The arrow keys, Home and End move through the items, a switch keeps the menu open, and
 * Escape or Tab shuts it.
 */
export function ToggleMenu({
  name,
  toggles,
  align = "start",
  onOpen,
}: {
  name: string;
  toggles: readonly MenuToggle[];
  align?: "start" | "end";
  /** Each time it's opened, for its caller's analytics. */
  onOpen?: () => void;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const { open, setOpen, root } = usePanel(button);
  const menuId = useId();
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const on = toggles.filter((t) => t.on).length;
  // An unavailable item's reason as a tooltip beside it, on hover and on keyboard focus (David, 3 Nov 2026: "Need
  // tooltips on hovered view options in the dropdown that aren't available. Explanations as to why"). Drawn on the
  // page, not in the panel, whose scrolling would clip it; to the item's right, or its left near the screen's edge.
  const [tip, setTip] = useState<{ i: number; rect: DOMRect } | null>(null);
  const showTip = (i: number, el: HTMLElement) =>
    toggles[i]?.reason ? setTip({ i, rect: el.getBoundingClientRect() }) : setTip(null);
  const hideTip = (i: number) => setTip((t) => (t?.i === i ? null : t));
  useEffect(() => {
    if (!open) setTip(null);
  }, [open]);
  // Opening puts the focus on the first item, as a menu's button does.
  const [focusFirst, setFocusFirst] = useState(false);
  useEffect(() => {
    if (open && focusFirst) items.current[0]?.focus();
    setFocusFirst(false);
  }, [open, focusFirst]);

  const onKey = (event: KeyboardEvent) => {
    // Escape takes the tooltip away first, and only then the menu.
    if (event.key === "Escape" && tip) {
      event.stopPropagation();
      setTip(null);
      return;
    }
    const at = items.current.indexOf(document.activeElement as HTMLButtonElement);
    const last = toggles.length - 1;
    const to =
      event.key === "ArrowDown"
        ? at >= last
          ? 0
          : at + 1
        : event.key === "ArrowUp"
          ? at <= 0
            ? last
            : at - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (event.key === "Tab") setOpen(false);
    if (to === null) return;
    event.preventDefault();
    items.current[to]?.focus();
  };

  return (
    <div className={styles.menu} ref={root}>
      <button
        ref={button}
        type="button"
        className={styles.button}
        data-active={on > 0 || undefined}
        aria-label={on > 0 ? `${name}, ${on} on` : undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => {
          if (!open) onOpen?.();
          setOpen(!open);
          setFocusFirst(!open);
        }}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown" || open) return;
          event.preventDefault();
          onOpen?.();
          setOpen(true);
          setFocusFirst(true);
        }}
      >
        <span className={styles.summary}>{name}</span>
        {on > 0 && <span className={styles.name}>{on} on</span>}
        <Icon name="chevronDown" size={16} />
      </button>
      <div
        id={menuId}
        role="menu"
        aria-label={name}
        className={styles.panel}
        hidden={!open}
        data-align={align}
        onKeyDown={onKey}
      >
        {toggles.map((toggle, i) => {
          const reason = toggle.reason ?? null;
          const whyId = `${menuId}-why-${i}`;
          const nameId = `${menuId}-name-${i}`;
          return (
            <button
              key={toggle.key}
              ref={(el) => {
                items.current[i] = el;
              }}
              type="button"
              role="menuitemcheckbox"
              aria-checked={toggle.on}
              // Named by its label alone: the reason under it describes it.
              aria-labelledby={nameId}
              aria-disabled={reason !== null || undefined}
              aria-describedby={reason !== null ? whyId : undefined}
              title={reason === null ? toggle.hint : undefined}
              tabIndex={-1}
              className={styles.toggle}
              data-disabled={reason !== null || undefined}
              data-under={toggle.under || undefined}
              onClick={() => reason === null && toggle.onToggle()}
              onPointerEnter={(e) => showTip(i, e.currentTarget)}
              onPointerLeave={() => hideTip(i)}
              onFocus={(e) => showTip(i, e.currentTarget)}
              onBlur={() => hideTip(i)}
            >
              <span className={styles.tick} data-on={toggle.on || undefined} aria-hidden="true">
                {toggle.on && (
                  <svg viewBox="0 0 16 16" width="12" height="12">
                    <path
                      d="M3 8.5l3 3 7-7"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </span>
              <span className={styles.toggleText}>
                <span id={nameId}>{toggle.label}</span>
                {reason !== null && (
                  <span id={whyId} className={styles.toggleWhy}>
                    {reason}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      {tip &&
        typeof document !== "undefined" &&
        createPortal(
          <ReasonTip rect={tip.rect} reason={toggles[tip.i]?.reason ?? ""} />,
          document.body,
        )}
    </div>
  );
}

const TIP_WIDTH = 260;

/** The reason beside its item, fixed to the page so neither the panel nor the card clips it. */
function ReasonTip({ rect, reason }: { rect: DOMRect; reason: string }) {
  // Read already as the item's description, so the tooltip itself is only seen.
  const right = window.innerWidth - rect.right > TIP_WIDTH + 16;
  return (
    <div
      aria-hidden="true"
      className={styles.tip}
      style={{
        top: rect.top + rect.height / 2,
        ...(right ? { left: rect.right + 8 } : { right: window.innerWidth - rect.left + 8 }),
        maxWidth: TIP_WIDTH,
      }}
    >
      {reason}
    </div>
  );
}
