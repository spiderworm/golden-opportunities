// Saved segments' words, Plot's (docs/design/chart-features-copy.md, section 8).
import { SEGMENT_LIMITS, type SegmentRefusal } from "./segments";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const SEGMENT_COPY = {
  menu: "Segment",
  none: "None",
  edited: (name: string) => `${name}, edited`,
  empty: "No segments yet. Add filters, then choose Save as segment.",
  save: "Save as segment",
  saveDisabled: "Add a filter to save it as a segment",
  saveTitle: "Save these filters as a segment",
  name: "Name",
  saveButton: "Save segment",
  cancel: "Cancel",
  renameTitle: "Rename segment",
  renameButton: "Save",
  rename: "Rename",
  editFilters: "Edit filters",
  delete: "Delete",
  update: (name: string) => `Update "${name}"`,
  deleteQuestion: (name: string) => `Delete "${name}"? This can't be undone.`,
  /** Only the parts that apply, singular for one: "It's used by 2 pinned charts and 1 report." */
  deleteInUse: (name: string, uses: { pins: number; reports: number }) => {
    const parts = [
      uses.pins ? plural(uses.pins, "pinned chart", "pinned charts") : null,
      uses.reports ? plural(uses.reports, "report", "reports") : null,
    ].filter((p) => p !== null);
    return `Delete "${name}"? It's used by ${parts.join(" and ")}. They'll go back to their own filters.`;
  },
  /** On a pin's card or a report's chart, under its title. */
  onChart: (name: string) => `Segment: ${name}`,
  /** Under a report's title, when the report has a segment. */
  onReport: (name: string) => `Every chart here shows ${name}.`,
  reportField: "Segment for this report",
  nothingMatches: (name: string) => `Nothing matches both this chart's filters and ${name}.`,
  deleted: "This used a segment that's since been deleted, so it shows its own filters now.",
  deleteButton: "Delete segment",
  keep: "Keep it",
} as const;

/** Why a change was refused, in Plot's words; `name` is the segment it clashes with. */
export function refusalCopy(reason: SegmentRefusal | "busy", name?: string): string {
  switch (reason) {
    case "no_name":
      return "Give the segment a name.";
    case "too_long":
      return `Keep the name to ${SEGMENT_LIMITS.name} characters.`;
    case "taken":
      return `You already have a segment called "${name}".`;
    case "same_filters":
      return `These filters are already saved as "${name}".`;
    case "full":
      return `You have ${SEGMENT_LIMITS.segments} segments. Delete one to save another.`;
    case "too_many":
      return `A segment holds up to ${plural(SEGMENT_LIMITS.values, "filter value", "filter values")}. Remove some to save it.`;
    case "missing":
      return "That segment was deleted in another tab.";
    case "no_filters":
      return SEGMENT_COPY.saveDisabled;
    case "busy":
      return "Your segment didn't save. Please save it again.";
    case "invalid":
      return "This name can't be saved. Check it and try again.";
  }
}
