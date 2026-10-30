// Every figure the assistant states must come from a tool in the same answer (Probe's red team, B1 and P2:
// it worked out a gross profit, a percent drop and a difference that no tool returned). The tools give it
// what it needs (compare_data works out changes), and the prompt forbids arithmetic; this checks the reply
// afterwards, so a figure that slips through is flagged to the player rather than trusted.
//
// A stated figure is backed when some number the tools returned (or the player wrote) rounds to it at the
// precision it's written in ("%" and "percent" match a fraction too). Integers up to 10 always pass: they're
// counts of lookups, rows and the like.

export interface Figure {
  text: string;
  value: number;
  /** Half a unit in the last written place: how far a rounded figure can be from the number it came from. */
  tolerance: number;
  percent: boolean;
}

const NUMBER = /(?<![\w.,])(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(%| percent\b)?(?![\w%])/g;

/** The figures written in some text. Digits inside words ("Q4", "3rd") aren't figures. */
export function figuresIn(text: string): Figure[] {
  return [...text.matchAll(NUMBER)].map((m) => {
    const whole = m[1].replace(/,/g, "");
    const decimals = m[2] ? m[2].length - 1 : 0;
    const value = Number(whole + (m[2] ?? ""));
    // "95,000" is rounded to the thousand; "100" or "2193" is exact.
    const zeros = decimals ? 0 : whole.length - whole.replace(/0+$/, "").length;
    const significant = whole.replace(/^0+/, "").length - zeros;
    const place = decimals ? 10 ** -decimals : significant >= 2 ? 10 ** zeros : 1;
    return { text: m[0], value, tolerance: place / 2, percent: m[3] !== undefined };
  });
}

/** Every number in a tool's input or output, including numbers written inside its strings (labels, sources). */
export function numbersIn(value: unknown, into: number[] = []): number[] {
  if (typeof value === "number" && Number.isFinite(value)) into.push(value);
  else if (typeof value === "string") for (const f of figuresIn(value)) into.push(f.value);
  else if (Array.isArray(value)) {
    into.push(value.length);
    for (const v of value) numbersIn(v, into);
  } else if (value && typeof value === "object") for (const v of Object.values(value)) numbersIn(v, into);
  return into;
}

const backedBy = (f: Figure, n: number) => {
  const candidates = f.percent ? [n, n * 100] : [n];
  return candidates.some((c) => Math.abs(Math.abs(c) - f.value) <= f.tolerance + 1e-9 * Math.max(1, f.value));
};

/** The figures in `reply` that none of `known` backs. */
export function unbackedFigures(reply: string, known: readonly number[]): Figure[] {
  return figuresIn(reply).filter((f) => !(Number.isInteger(f.value) && !f.percent && f.value <= 10) && !known.some((n) => backedBy(f, n)));
}

/**
 * Hides a secret (the prompt's fence code) from a reply as it streams. A chunk can end partway through it, so
 * any tail that could be its start is held back until the next chunk.
 */
export function scrubber(secret: string, replacement = "[hidden]") {
  let held = "";
  return {
    push(chunk: string): string {
      const text = (held + chunk).split(secret).join(replacement);
      let keep = Math.min(secret.length - 1, text.length);
      while (keep > 0 && !secret.startsWith(text.slice(-keep))) keep--;
      held = keep ? text.slice(-keep) : "";
      return keep ? text.slice(0, -keep) : text;
    },
    flush(): string {
      const rest = held;
      held = "";
      return rest;
    },
  };
}
