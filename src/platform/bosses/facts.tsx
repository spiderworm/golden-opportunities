/** A fact strip's sentence: plain text, with the figures the player needs set in bold. */
export type FactLine = (string | { strong: string })[];

export function FactText({ line }: { line: readonly FactLine[number][] }) {
  return line.map((part, i) =>
    typeof part === "string" ? part : <strong key={i}>{part.strong}</strong>,
  );
}
