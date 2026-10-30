// Every figure the assistant states must come from a tool in the same answer (Probe's red team, B1 and P2:
// it worked out a gross profit, a percent drop and a difference that no tool returned). The tools give it
// what it needs (compare_data works out changes), the prompt forbids arithmetic, and this enforces it: the
// reply is held a sentence at a time, and a sentence with a figure no tool backs is withheld before display.
//
// Evidence is only what successful tool outputs measured (result values, totals, comparison figures, row
// counts), each with its unit. Labels the data returned (a "15%" discount rate, a title) back a figure only
// when written exactly as they are. Nothing the model sent into a tool counts, and nor does anything the
// player wrote (Audit and Probe, #32).
//
// A written figure is backed when a measured value rounds to it at the precision it's written in, with the
// same unit ($ for money, % for percents) and, if the figure has an explicit sign, the same sign. A figure
// written without a unit may be any measured value (revenue is often written without the $); an unsigned one
// is a magnitude, unless a direction word in its clause (or, failing that, its sentence) gives it a sign:
// "a rise of 1.8%" needs a positive change behind it, "fell by 2,912" a negative one (Goldy, #32). Direction
// words only constrain changes; levels ("rose to 164,437") are checked as levels. Ratios ("1.7x", "two-thirds", "twice as many") are never backed: no tool returns one.
// Years and periods ("2193", "2193-Q4") are names, not figures. Number words one to ten on their own aren't
// read as figures ("two lookups"); every digit is. This can't tell whether a backed number describes the
// right measure; it stops invented ones.

import type { Measure } from "../../query/types.ts";

export type Unit = "currency" | "percent" | "plain" | "ratio";

export interface Figure {
  text: string;
  /** The magnitude written, with any K/thousand/M/million applied. */
  value: number;
  /** An explicit sign: -1, 1, or 0 for none. */
  sign: -1 | 0 | 1;
  unit: Unit;
  /** The place it's rounded to: 0.01 for "1.25", 1000 for "95,000", "63K" or "sixty-three thousand". */
  place: number;
  /** The figure as a label would be written: digits and "%" only. */
  label: string;
  /** Where it starts in the text. */
  at: number;
}

const PERIOD = /\b(?:\d{4}-Q[1-4]|Q[1-4](?:\s+|-)\d{4})\b/gi;
const SCALES: Record<string, number> = { k: 1e3, thousand: 1e3, m: 1e6, mn: 1e6, million: 1e6, b: 1e9, bn: 1e9, billion: 1e9 };
const NUMBER = /(?<![\w.,$+\-−])([+\-−]\s?)?(\$\s?)?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?((?:k|m|mn|b|bn)\b|\s(?:thousand|million|billion)\b)?(\s?%|\s(?:percent|per cent)\b)?(?![\w%]|\.\d)/gi;
const COUNT_WORDS = "one|two|three|four|five|six|seven|eight|nine|ten";
const MULTIPLIER = new RegExp(`(?<![\\w.])\\d+(?:\\.\\d+)?\\s?(?:x|×|times)(?!\\w)|\\b(?:${COUNT_WORDS})\\s+times\\b|\\b(?:twice|thrice|double|triple|quadruple|half)\\s+(?:as|the)\\b`, "gi");
const FRACTION_WORDS = "halves|half|thirds?|quarters?|fifths?|sixths?|sevenths?|eighths?|ninths?|tenths?";
// "two-thirds", "a third of", "1/3", "1 in 5", "one in every five"; not "a quarter" alone, which is a period.
const FRACTION = new RegExp(
  `(?<![\\w.])\\d+\\s?/\\s?\\d+(?![\\w.]\\d)|(?<![\\w.])(?:\\d+|${COUNT_WORDS}|a)\\s+in\\s+(?:every\\s+)?(?!(?:19|2[0-2])\\d\\d\\b)(?:\\d+|${COUNT_WORDS})\\b|\\b(?:${COUNT_WORDS})-(?:${FRACTION_WORDS})\\b|\\b(?:a|${COUNT_WORDS})\\s+(?:${FRACTION_WORDS})\\s+of\\b|\\bhalf\\s+of\\b`,
  "gi",
);
const SMALL = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const WORD = `(?:${[...SMALL, ...TENS.filter(Boolean), "hundred", "thousand", "million", "billion"].join("|")})`;
// Not a scale after digits ("1.2 million"): NUMBER reads that.
const WORDS = new RegExp(`(?<!\\d\\s?)\\b${WORD}(?:(?:[\\s-]+|\\s+and\\s+)${WORD})*\\b(\\s+(?:percent|per cent)\\b)?`, "gi");

/** "sixty-three thousand five hundred" as 63500, rounded to the hundred. */
function wordsValue(text: string): { value: number; place: number; words: number } {
  let total = 0;
  let group = 0;
  let place = 1;
  const words = text.toLowerCase().split(/[\s-]+/).filter((w) => w && w !== "and");
  for (const w of words) {
    if (SMALL.includes(w)) {
      group += SMALL.indexOf(w);
      place = 1;
    } else if (TENS.includes(w)) {
      group += TENS.indexOf(w) * 10;
      place = 1;
    } else if (w === "hundred") {
      group = (group || 1) * 100;
      place = 100;
    } else {
      total += (group || 1) * SCALES[w];
      group = 0;
      place = SCALES[w];
    }
  }
  return { value: total + group, place, words: words.length };
}

/** The figures written in some text. Digits inside words ("Q4", "3rd"), years and periods aren't figures. */
export function figuresIn(text: string): Figure[] {
  const figures: Figure[] = [];
  // Each kind blanks out what it read, so a later, plainer reading doesn't see it again.
  let rest = text.replace(PERIOD, (m) => " ".repeat(m.length));
  const take = (pattern: RegExp, read: (m: RegExpMatchArray) => Omit<Figure, "at"> | null) => {
    rest = rest.replace(pattern, (...args) => {
      const m = Object.assign([...args.slice(0, -2)], { index: args.at(-2) as number }) as unknown as RegExpMatchArray;
      const f = read(m);
      if (!f) return m[0];
      figures.push({ ...f, at: m.index! });
      return " ".repeat(m[0].length);
    });
  };
  const ratio = (m: RegExpMatchArray): Omit<Figure, "at"> => ({ text: m[0], value: NaN, sign: 0, unit: "ratio", place: 1, label: m[0] });
  take(MULTIPLIER, ratio);
  take(FRACTION, ratio);
  take(WORDS, (m) => {
    const { value, place, words } = wordsValue(m[0].replace(/\s+(percent|per cent)$/i, ""));
    if (words === 1 && value <= 10 && !m[1]) return null;
    return { text: m[0], value, sign: 0, unit: m[1] ? "percent" : "plain", place, label: String(value) + (m[1] ? "%" : "") };
  });
  take(NUMBER, (m) => {
    const [, signText, dollar, whole, fraction, scaleText, percent] = m;
    const digits = whole.replace(/,/g, "");
    // A bare four-digit number in the game's centuries is a year: a name, like a period.
    if (!signText && !dollar && !fraction && !scaleText && !percent && /^(19|2[0-2])\d\d$/.test(whole)) return null;
    const scale = scaleText ? SCALES[scaleText.trim().toLowerCase()] : 1;
    const decimals = fraction ? fraction.length - 1 : 0;
    // "95,000" is rounded to the thousand; "100" is exact.
    const zeros = decimals || scale > 1 ? 0 : digits.length - digits.replace(/0+$/, "").length;
    const significant = digits.replace(/^0+/, "").length - zeros;
    const place = (decimals ? 10 ** -decimals : significant >= 2 ? 10 ** zeros : 1) * scale;
    return {
      text: m[0],
      value: Number(digits + (fraction ?? "")) * scale,
      sign: !signText ? 0 : signText.trim() === "+" ? 1 : -1,
      unit: dollar ? "currency" : percent ? "percent" : "plain",
      place,
      label: digits + (fraction ?? "") + (percent ? "%" : ""),
    };
  });
  return figures.sort((a, b) => a.at - b.at);
}

export interface Measured {
  value: number;
  unit: Unit | "count";
  /** A change (to minus from, or its percent): its sign is a direction, which direction words must agree with. */
  change?: boolean;
}

// "Up" and "down" after verbs like "looked" or "broken" are no direction ("I looked up", "broken down").
const PHRASAL = "(?<!\\b(?:look|looks|looked|looking|break|breaks|broke|broken|breaking|narrow|narrowed|set|pick|picked|sum|summed|show|showed|turn|turned|write|wrote|written|look it|break it|narrow it)\\s)";
const RISE = new RegExp(`\\b(?:ris(?:e|es|en|ing)|rose|${PHRASAL}up|increas(?:e|es|ed|ing)|gr(?:ew|ow|ows|own|owing)|higher|gains?|gained|more|climb(?:s|ed)?|jump(?:s|ed)?)\\b`, "i");
const FALL = new RegExp(`\\b(?:fall(?:s|en|ing)?|fell|${PHRASAL}down|decreas(?:e|es|ed|ing)|drops?|dropped|declin(?:e|es|ed|ing)|lower|loss|lost|fewer|less|shr(?:ank|unk|inks?)|slid|dips?|dipped)\\b`, "i");
// Commas between thousands ("2,912") don't end a clause; a comma and a space does.
const CLAUSE = /[^;:()]*?(?:[;:()]|,\s|\s(?:and|but|while|whereas|which)\s|$)/gi;

/** The direction a stretch of text gives: 1 for a rise, -1 for a fall, 0 for none or both. */
function direction(text: string): -1 | 0 | 1 {
  const up = RISE.test(text);
  const down = FALL.test(text);
  return up === down ? 0 : up ? 1 : -1;
}

const MEASURE_UNITS: Record<Measure, Unit | "count" | "fraction"> = {
  revenue: "currency",
  avg_order_value: "currency",
  units: "count",
  orders: "count",
  checkouts: "count",
  avg_discount: "fraction",
  avg_rating: "plain",
  orders_per_day: "plain",
};

/** What a successful tool call backs: measured values with units, and the labels the data returned. */
export class Evidence {
  readonly measured: Measured[] = [];
  readonly labels = new Set<string>();

  private measure(measure: unknown, value: unknown, change = false) {
    if (typeof value !== "number" || !Number.isFinite(value) || typeof measure !== "string" || !(measure in MEASURE_UNITS)) return;
    const unit = MEASURE_UNITS[measure as Measure];
    if (unit === "fraction") {
      this.measured.push({ value: value * 100, unit: "percent", change }, { value, unit: "plain", change });
    } else this.measured.push({ value, unit, change });
  }

  private label(value: unknown) {
    if (typeof value === "string") for (const f of figuresIn(value)) this.labels.add(f.label);
  }

  /** Adds a successful tool call. `input` is the model's (checked by the tool server); `output` is ours. */
  addTool(name: string, input: unknown, output: unknown) {
    if (!output || typeof output !== "object") return;
    const out = output as Record<string, unknown>;
    const measure = input && typeof input === "object" ? (input as Record<string, unknown>).measure : undefined;
    const rows = Array.isArray(out.rows) ? (out.rows as Record<string, unknown>[]) : [];
    if (name === "query_data") {
      this.measured.push({ value: rows.length, unit: "count" });
      for (const row of rows) {
        for (const [key, v] of Object.entries(row)) key === measure ? this.measure(measure, v) : this.label(v);
      }
      this.measure(measure, out.total);
      // The model's filter values are labels only where the data had something there.
      const filter = input && typeof input === "object" ? (input as Record<string, unknown>).filter : undefined;
      if (typeof out.total === "number" && out.total !== 0 && filter && typeof filter === "object") {
        for (const values of Object.values(filter)) if (Array.isArray(values)) values.forEach((v) => this.label(v));
      }
    } else if (name === "compare_data") {
      this.measured.push({ value: rows.length, unit: "count" });
      const add = (figures: Record<string, unknown>) => {
        this.measure(measure, figures.from);
        this.measure(measure, figures.to);
        this.measure(measure, figures.change, true);
        if (typeof figures.percent_change === "number") this.measured.push({ value: figures.percent_change, unit: "percent", change: true });
      };
      for (const row of rows) {
        add(row);
        for (const [key, v] of Object.entries(row)) if (!["from", "to", "change", "percent_change"].includes(key)) this.label(v);
      }
      const total = (out.total ?? {}) as Record<string, unknown>;
      add(total);
      // The compared values are the model's, so they count as labels only where the data had something there.
      const columns = Array.isArray(out.columns) ? (out.columns as { key?: unknown; label?: unknown }[]) : [];
      for (const side of ["from", "to"]) {
        if (typeof total[side] === "number" && total[side] !== 0) this.label(columns.find((c) => c.key === side)?.label);
      }
    } else if (name === "pin_chart" && typeof out.rows === "number") {
      this.measured.push({ value: out.rows, unit: "count" });
    }
  }

  /** Whether something backs `f`. `heading` is the direction its clause or sentence gives (0 for none). */
  backs(f: Figure, heading: -1 | 0 | 1 = 0): boolean {
    if (f.unit === "ratio") return false;
    // "rose -5%": the written sign and the words disagree.
    if (f.sign !== 0 && heading !== 0 && f.sign !== heading) return false;
    // Labels are names ("the 15% rate"), so no direction applies to them.
    if (f.sign === 0 && f.unit !== "currency" && this.labels.has(f.label)) return true;
    return this.measured.some((m) => {
      if (f.unit === "currency" ? m.unit !== "currency" : f.unit === "percent" ? m.unit !== "percent" : false) return false;
      if (f.sign !== 0 && Math.sign(m.value) !== f.sign) return false;
      if (heading !== 0 && m.change && Math.sign(m.value) !== heading) return false;
      return Math.abs(Math.round(Math.abs(m.value) / f.place) - f.value / f.place) < 1e-6;
    });
  }

  /** The figures in `text` (a sentence, or a pin title) that nothing backs, read with their direction words. */
  unbacked(text: string): Figure[] {
    const overall = direction(text);
    const clauses = [...text.matchAll(CLAUSE)].filter((m) => m[0]).map((m) => ({ start: m.index!, end: m.index! + m[0].length, heading: direction(m[0]) }));
    return figuresIn(text).filter((f) => {
      const clause = clauses.find((c) => f.at >= c.start && f.at < c.end);
      return !this.backs(f, clause?.heading || overall);
    });
  }
}

export const WITHHELD = "I'd rather not give a number I didn't look up.";

/**
 * Holds the reply a sentence at a time and withholds any sentence with a figure the evidence doesn't back,
 * replacing a run of them with one short note. The evidence is read when each sentence completes, so a
 * figure stated before its lookup came back is withheld too.
 */
export function sentenceGate(evidence: Evidence, clean: (s: string) => string = (s) => s) {
  let held = "";
  let withheldLast = false;
  let withheld = 0;
  const check = (sentences: string) => {
    let out = "";
    // Whitespace after a withheld run, kept until the run ends, so a run of withheld sentences is one note.
    let gap = "";
    for (const sentence of sentences.match(/[^]*?(?:[.!?]+(?:\s+|$)|\n+|$)/g) ?? []) {
      if (!sentence) continue;
      const bad = evidence.unbacked(sentence).length;
      if (!bad) {
        out += gap + sentence;
        gap = "";
        withheldLast = false;
        continue;
      }
      withheld += bad;
      if (!withheldLast) out += gap + WITHHELD;
      gap = /\s*$/.exec(sentence)![0];
      withheldLast = true;
    }
    return clean(out + gap);
  };
  return {
    /** Returns the complete sentences that can be shown now. */
    push(chunk: string): string {
      held += chunk;
      // A sentence ends at ., ! or ? followed by whitespace (not "161,524.69"), or at a line break.
      const ends = [...held.matchAll(/[.!?]+\s+|\n+/g)];
      if (!ends.length) return "";
      const last = ends.at(-1)!;
      const cut = last.index + last[0].length;
      const ready = held.slice(0, cut);
      held = held.slice(cut);
      return check(ready);
    },
    flush(): string {
      const rest = held;
      held = "";
      return rest ? check(rest) : "";
    },
    get withheld() {
      return withheld;
    },
  };
}

/** Replaces `secret` in every string of a JSON-like value (wire events other than text). */
export function scrubDeep<T>(value: T, secret: string, replacement = "[hidden]"): T {
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return v.split(secret).join(replacement);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [walk(k), walk(x)]));
    return v;
  };
  return walk(value) as T;
}
