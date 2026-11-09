import { useEffect, useRef, useState, type CSSProperties } from "react";

import { quarterName } from "~/game/event-title";
import {
  formatDimensionValue,
  periodLabel,
  RELATIVE_HINT,
  relativeLabel,
  relativeReason,
} from "~/investigate/format";
import type { PinSpec } from "~/investigate/pins/spec";
import { Dropdown, type DropdownOption } from "~/platform/ui/Dropdown";
import { RELATIVE_QUARTERS } from "~/query/relative";
import { RUN_FOR_COPY as COPY } from "./copy";
import type { RunChoice } from "./run-for";
import styles from "./Reports.module.css";

// "Run for…" (Plot, chart-features-copy.md section 9): beside a report's title, a picker of As saved, the three
// relative quarters and each played quarter, newest first; once it's run for one, a note with Back to as saved. A view
// only: nothing saved changes. Reports and Decide's panel keep the choice while the report is open.

/** The list's widest, as Reports.module.css's .runFor has it. */
const PANEL_MAX = 280;
/** Kept clear between the list and the edge of its room. */
const EDGE = 8;

/**
 * Which way the list opens from a button at `buttonLeft`..`buttonRight`, inside room from `left` to `right`, and how
 * wide it may be: leftward if it fits, else rightward if it fits, else toward the roomier side, narrowed to fit.
 */
export function placeList(buttonLeft: number, buttonRight: number, left: number, right: number) {
  const leftward = buttonRight - left - EDGE;
  const rightward = right - buttonLeft - EDGE;
  const align: "start" | "end" =
    leftward >= PANEL_MAX
      ? "end"
      : rightward >= PANEL_MAX
        ? "start"
        : leftward >= rightward
          ? "end"
          : "start";
  return { align, width: Math.max(0, Math.min(PANEL_MAX, align === "end" ? leftward : rightward)) };
}

/** The button and its picker. */
export function RunForPicker({
  choice,
  quarters,
  onChoose,
}: {
  choice: RunChoice;
  /** The quarters the player can see. */
  quarters: readonly string[];
  onChoose: (choice: RunChoice) => void;
}) {
  const options: DropdownOption<RunChoice>[] = [
    { value: "saved", label: COPY.asSaved },
    ...RELATIVE_QUARTERS.map((token) => ({
      value: token,
      // As the quarter filter shows them: "Latest quarter: Q4 2193" (Plot, #410).
      label: relativeLabel(token, quarters),
      hint: RELATIVE_HINT,
      disabledReason: relativeReason(token, quarters),
    })),
    ...[...quarters]
      .sort()
      .reverse()
      .map((q) => ({ value: q, label: quarterName(q) })),
  ];
  // The list opens toward the side with room inside whatever clips it: Decide's side panel, else the window. Measured
  // in Decide: from a button at the panel's right, a leftward list fits (1440 px); where the header wraps and the
  // button sits at the left edge (390 px), a leftward one was off the screen, so it opens rightward.
  const root = useRef<HTMLSpanElement>(null);
  const [placed, setPlace] = useState<{ align: "start" | "end"; width: number }>({
    align: "end",
    width: PANEL_MAX,
  });
  const place = () => {
    const button = root.current?.getBoundingClientRect();
    if (!button) return;
    // The room: the clipping panel (Decide's aside), within the window.
    const clip = root.current!.closest("aside")?.getBoundingClientRect();
    const left = Math.max(clip?.left ?? 0, 0);
    const right = Math.min(clip?.right ?? window.innerWidth, window.innerWidth);
    const { align, width } = placeList(button.left, button.right, left, right);
    setPlace((now) => (now.align === align && now.width === width ? now : { align, width }));
  };
  useEffect(() => {
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, []);
  return (
    // Marked, so a panel that closes on Escape (Decide's) leaves this Escape to the open picker. Placed again as it's
    // opened, since the header may have wrapped since.
    <span
      ref={root}
      data-run-for=""
      className={styles.runFor}
      style={{ "--run-for-width": `${placed.width}px` } as CSSProperties}
      onPointerDownCapture={place}
      onKeyDownCapture={place}
    >
      <Dropdown
        mode="single"
        name={COPY.button}
        legend={COPY.legend}
        align={placed.align}
        trigger={{ className: styles.linkButton, content: COPY.button }}
        value={choice}
        options={options}
        onChange={onChoose}
      />
    </span>
  );
}

/** Under the title, once it's run for another quarter: what that does, and the way back. */
export function RunForNote({
  quarter,
  movable,
  onBack,
}: {
  quarter: string | null;
  /** Whether any chart can move; when none can, the note says so (Plot, #412). */
  movable: boolean;
  onBack: () => void;
}) {
  if (!quarter) return null;
  return (
    <p className={styles.muted} role="status">
      {movable ? COPY.note(quarterName(quarter)) : COPY.noneMove(quarterName(quarter))}{" "}
      <button type="button" className={styles.linkButton} onClick={onBack}>
        {COPY.back}
      </button>
    </p>
  );
}

/** A list in words, as periodLabel joins quarters: "a", "a and b", "a, b and c". */
const listed = (parts: readonly string[]) =>
  parts.length < 2 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;

/**
 * What a moved chart shows now, for its "Now:" line (Plot, #412): a waterfall's two quarters, a comparison's sides
 * across quarters or months, else its months, the narrower filter, or its quarters as periodLabel lists them. Null if
 * it names none.
 */
export function nowShows(spec: PinSpec): string | null {
  if (spec.kind === "waterfall")
    return `${quarterName(spec.waterfall.then)} to ${quarterName(spec.waterfall.now)}`;
  if (
    spec.kind === "comparison" &&
    (spec.comparison.across === "quarter" || spec.comparison.across === "month")
  ) {
    const c = spec.comparison;
    return `${formatDimensionValue(c.across, c.from)} against ${formatDimensionValue(c.across, c.to)}`;
  }
  const filter = spec.kind === "comparison" ? spec.comparison.filter : spec.query.filter;
  if (filter?.month?.length)
    return listed([...filter.month].sort().map((m) => formatDimensionValue("month", m)));
  if (filter?.quarter?.length) return periodLabel(filter.quarter);
  return null;
}

/** Whether an Escape is the open picker's to close, not the panel's around it. */
export const pickerEscape = (target: EventTarget | null) =>
  !!(
    target instanceof Element &&
    target.closest("[data-run-for]")?.querySelector('[aria-expanded="true"]')
  );
