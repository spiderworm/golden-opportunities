// Saved segments on Investigate's filter bar (Plot, section 8): the Segment menu at its start, and Save as segment
// (or Update, once a segment's filters are edited) after Add a filter. Changes go through /api/segments
// (store.ts); what's applied is the URL's `segment=` (state.ts, withSegment).
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Icon } from "~/shell/icons";
import { usePanel } from "~/platform/ui/Dropdown";
import dropdown from "~/platform/ui/Dropdown.module.css";
import investigate from "~/investigate/Investigate.module.css";
import { formatDimensionValue } from "~/investigate/format";
import { FILTER_DIMENSIONS, type Filters } from "~/investigate/state";
import { refusalCopy, SEGMENT_COPY as COPY } from "./copy";
import { SEGMENT_LIMITS, type Segment, type SegmentChange } from "./segments";
import { changeSegments, refreshSegments } from "./store";
import styles from "./Segments.module.css";

/** A name to start from, the filters' values as the bar names them ("Award winner, Trade paperback"), cut to fit. */
export function suggestedName(filters: Filters): string {
  const parts = FILTER_DIMENSIONS.flatMap((d) =>
    (filters[d] ?? []).map((v) => formatDimensionValue(d, v)),
  );
  let name = "";
  for (const part of parts) {
    const next = name ? `${name}, ${part}` : part;
    if (next.length > SEGMENT_LIMITS.name) break;
    name = next;
  }
  return name || parts[0]?.slice(0, SEGMENT_LIMITS.name) || "";
}

/** One change sent, with what came back: done (with the segment's id), or Plot's reason why not. */
async function send(change: SegmentChange): Promise<{ id: string } | { error: string }> {
  try {
    const answer = await changeSegments(change);
    return answer.ok
      ? { id: answer.id }
      : { error: refusalCopy(answer.reason, "name" in answer ? answer.name : undefined) };
  } catch {
    return { error: refusalCopy("busy") };
  }
}

/** A modal asking one thing; its own form, so Enter submits and Escape cancels. */
function Dialog({
  title,
  open,
  onClose,
  children,
  role = "dialog",
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  role?: "dialog" | "alertdialog";
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);
  return (
    <dialog
      ref={dialog}
      role={role}
      aria-labelledby={titleId}
      className={styles.dialog}
      onClose={onClose}
    >
      <h2 id={titleId} className={styles.dialogTitle}>
        {title}
      </h2>
      {children}
    </dialog>
  );
}

/** Save a new segment, or rename one: a name, checked by the server, with Plot's errors under the field. */
function NameDialog({
  open,
  title,
  submit,
  initial,
  onSubmit,
  onClose,
}: {
  open: boolean;
  title: string;
  submit: string;
  initial: string;
  onSubmit: (name: string) => Promise<string | null>;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const errorId = useId();
  useEffect(() => {
    if (open) {
      setName(initial);
      setError(null);
    }
  }, [open, initial]);
  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const refused = await onSubmit(name);
    setSaving(false);
    if (refused) setError(refused);
    else onClose();
  }
  return (
    <Dialog title={title} open={open} onClose={onClose}>
      <form className={styles.form} onSubmit={save}>
        <label className={styles.field}>
          <span>{COPY.name}</span>
          <input
            value={name}
            autoFocus
            maxLength={SEGMENT_LIMITS.name + 20}
            aria-invalid={error !== null || undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        {error && (
          <p id={errorId} className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.actions}>
          <button type="submit" className={styles.primary} disabled={saving}>
            {submit}
          </button>
          <button type="button" className={styles.secondary} onClick={onClose}>
            {COPY.cancel}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export interface SegmentMenuProps {
  segments: readonly Segment[];
  /** The segment the bar's filters came from, if any (the URL's `segment=`). */
  applied: Segment | null;
  /** Whether a filter has changed since it was applied. */
  edited: boolean;
  /** Put a segment's filters on the bar, or null for none. */
  onApply: (segment: Segment | null) => void;
  /** A segment is gone (deleted here): the bar stops naming it. */
  onDeleted: (id: string) => void;
}

/** `Segment: None`, `Segment: {name}` or `Segment: {name}, edited`, and each segment with Rename, Edit filters and Delete. */
export function SegmentMenu({ segments, applied, edited, onApply, onDeleted }: SegmentMenuProps) {
  const button = useRef<HTMLButtonElement>(null);
  const { open, setOpen, root } = usePanel(button);
  const panelId = useId();
  const [renaming, setRenaming] = useState<Segment | null>(null);
  const [deleting, setDeleting] = useState<Segment | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const summary = applied ? (edited ? COPY.edited(applied.name) : applied.name) : COPY.none;

  // As the menu opens, the list as the save has it now: one deleted in another tab drops out.
  useEffect(() => {
    if (open) refreshSegments().catch(() => {});
  }, [open]);

  const choose = (segment: Segment | null) => {
    setOpen(false);
    setNotice(null);
    button.current?.focus();
    onApply(segment);
  };

  return (
    <div className={dropdown.menu} ref={root}>
      <button
        ref={button}
        type="button"
        className={dropdown.button}
        data-active={applied ? true : undefined}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
      >
        <span className={dropdown.name}>{COPY.menu}</span>
        <span className={dropdown.summary}>{summary}</span>
        <Icon name="chevronDown" size={16} />
      </button>
      {notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}
      <fieldset id={panelId} className={dropdown.panel} hidden={!open}>
        <legend className={dropdown.legend}>{COPY.menu}</legend>
        <label className={dropdown.option}>
          <input
            type="radio"
            name={panelId}
            checked={applied === null}
            onChange={() => choose(null)}
          />
          <span>{COPY.none}</span>
        </label>
        {segments.length === 0 && <p className={dropdown.empty}>{COPY.empty}</p>}
        {segments.map((segment) => (
          <div key={segment.id} className={styles.row}>
            <label className={dropdown.option}>
              <input
                type="radio"
                name={panelId}
                checked={applied?.id === segment.id}
                onChange={() => choose(segment)}
              />
              <span>{segment.name}</span>
            </label>
            <span className={styles.rowActions}>
              <button
                type="button"
                className={styles.link}
                aria-label={`${COPY.rename} ${segment.name}`}
                onClick={() => {
                  setOpen(false);
                  setRenaming(segment);
                }}
              >
                {COPY.rename}
              </button>
              <button
                type="button"
                className={styles.link}
                aria-label={`${COPY.editFilters} of ${segment.name}`}
                onClick={() => choose(segment)}
              >
                {COPY.editFilters}
              </button>
              <button
                type="button"
                className={styles.link}
                aria-label={`${COPY.delete} ${segment.name}`}
                onClick={() => {
                  setOpen(false);
                  setDeleteError(null);
                  setDeleting(segment);
                }}
              >
                {COPY.delete}
              </button>
            </span>
          </div>
        ))}
      </fieldset>
      <NameDialog
        open={renaming !== null}
        title={COPY.renameTitle}
        submit={COPY.renameButton}
        initial={renaming?.name ?? ""}
        onClose={() => setRenaming(null)}
        onSubmit={async (name) => {
          const done = await send({ intent: "rename", id: renaming!.id, name });
          return "error" in done ? done.error : null;
        }}
      />
      <Dialog
        title={deleting ? COPY.deleteQuestion(deleting.name) : ""}
        open={deleting !== null}
        role="alertdialog"
        onClose={() => setDeleting(null)}
      >
        {deleteError && (
          <p className={styles.error} role="alert">
            {deleteError}
          </p>
        )}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.danger}
            onClick={async () => {
              const gone = deleting!;
              const done = await send({ intent: "delete", id: gone.id });
              if ("error" in done && done.error !== refusalCopy("missing")) {
                setDeleteError(done.error);
                return;
              }
              setDeleting(null);
              onDeleted(gone.id);
            }}
          >
            {COPY.deleteButton}
          </button>
          <button
            type="button"
            className={styles.secondary}
            autoFocus
            onClick={() => setDeleting(null)}
          >
            {COPY.keep}
          </button>
        </div>
      </Dialog>
    </div>
  );
}

export interface SegmentActionsProps {
  filters: Filters;
  applied: Segment | null;
  edited: boolean;
  /** A segment was saved from these filters: the bar names it. */
  onSaved: (id: string) => void;
}

/** Save as segment, or, once an applied segment's filters are edited, Update "{name}" beside it. */
export function SegmentActions({ filters, applied, edited, onSaved }: SegmentActionsProps) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const any = Object.keys(filters).length > 0;
  const initial = suggestedName(filters);
  useEffect(() => setMessage(null), [JSON.stringify(filters)]);

  return (
    <>
      {applied && edited && (
        <button
          type="button"
          className={investigate.clearAll}
          disabled={updating}
          onClick={async () => {
            setUpdating(true);
            const done = await send({ intent: "update", id: applied.id, filters });
            setUpdating(false);
            setMessage("error" in done ? done.error : null);
          }}
        >
          {COPY.update(applied.name)}
        </button>
      )}
      <button
        type="button"
        className={investigate.clearAll}
        aria-disabled={!any || undefined}
        title={any ? undefined : COPY.saveDisabled}
        onClick={() => {
          if (any) setSaving(true);
        }}
      >
        {COPY.save}
      </button>
      {message && (
        <p className={styles.notice} role="status">
          {message}
        </p>
      )}
      <NameDialog
        open={saving}
        title={COPY.saveTitle}
        submit={COPY.saveButton}
        initial={initial}
        onClose={() => setSaving(false)}
        onSubmit={async (name) => {
          const done = await send({ intent: "create", name, filters });
          if ("error" in done) return done.error;
          onSaved(done.id);
          return null;
        }}
      />
    </>
  );
}
