// Claude Code puts the signed-in account's email in the model's context, and no flag removes it (see
// engine-notes.md). The game never needs an email address, so every one is cut from the reply as it streams.
// A chunk can end partway through an address, so the last word is held back until the next chunk shows
// where it ends.

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+/g;
export const REDACTED = "[address removed]";

export function emailRedactor() {
  let held = "";
  const clean = (s: string) => s.replace(EMAIL, REDACTED);
  return {
    /** Returns what can safely be shown now. */
    push(chunk: string): string {
      const text = held + chunk;
      const cut = Math.max(text.lastIndexOf(" "), text.lastIndexOf("\n"), text.lastIndexOf("\t")) + 1;
      held = text.slice(cut);
      return clean(text.slice(0, cut));
    },
    /** The rest, at the end of the reply. */
    flush(): string {
      const rest = clean(held);
      held = "";
      return rest;
    },
  };
}
