import { quarterName } from "~/game/event-title";
import { RELATIVE_HINT, RELATIVE_NAMES, relativeReason } from "~/investigate/format";
import { Dropdown, type DropdownOption } from "~/platform/ui/Dropdown";
import { RELATIVE_QUARTERS } from "~/query/relative";
import { RUN_FOR_COPY as COPY } from "./copy";
import type { RunChoice } from "./run-for";
import styles from "./Reports.module.css";

// "Run for…" (Plot, chart-features-copy.md section 9): beside a report's title, a picker of As saved, the three
// relative quarters and each played quarter, newest first; once it's run for one, a note with Back to as saved. A view
// only: nothing saved changes. Reports and Decide's panel keep the choice while the report is open.

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
      label: RELATIVE_NAMES[token],
      hint: RELATIVE_HINT,
      disabledReason: relativeReason(token, quarters),
    })),
    ...[...quarters]
      .sort()
      .reverse()
      .map((q) => ({ value: q, label: quarterName(q) })),
  ];
  return (
    // Marked, so a panel that closes on Escape (Decide's) leaves this Escape to the open picker.
    <span data-run-for="">
      <Dropdown
        mode="single"
        name={COPY.button}
        legend={COPY.legend}
        align="end"
        trigger={{ className: styles.linkButton, content: COPY.button }}
        value={choice}
        options={options}
        onChange={onChoose}
      />
    </span>
  );
}

/** Under the title, once it's run for another quarter: what that does, and the way back. */
export function RunForNote({ quarter, onBack }: { quarter: string | null; onBack: () => void }) {
  if (!quarter) return null;
  return (
    <p className={styles.muted} role="status">
      {COPY.note(quarterName(quarter))}{" "}
      <button type="button" className={styles.linkButton} onClick={onBack}>
        {COPY.back}
      </button>
    </p>
  );
}

/** Whether an Escape is the open picker's to close, not the panel's around it. */
export const pickerEscape = (target: EventTarget | null) =>
  !!(
    target instanceof Element &&
    target.closest("[data-run-for]")?.querySelector('[aria-expanded="true"]')
  );
