// Figures by reference. The assistant never writes a figure, a direction or a comparison itself: it cites a
// lookup's ref ({{a2}}, {{b.change}}, {{b.from_vs_to}}) and this fills in the value, its unit and its
// direction from the data. Its own prose is checked lexically, with no attempt to read meaning: a sentence
// with any digit, $, %, number word, or comparative or direction word outside a ref is withheld before
// display, and so is a sentence citing a ref this answer's lookups didn't return. (Probe's red team and three
// rounds of Audit's review of #32 showed that guessing at what free-text numbers mean can't be made sound.)
//
// The only thing with a number in it that may appear in prose is a period name this answer's lookups had
// returned when the text arrived ("2193-Q4", "Q4"). A few exact phrases are allowed despite their words
// ("looked up", "broken down by", "in more detail"). What this guarantees, and what it can't, is in
// engine-notes.md.
//
// Fallback, if refs prove brittle with the model: no figures in prose at all, only "the table is under this
// message", with the same lexical ban.

import { evidenceUnit } from "../../query/evidence.ts";
import type { Measure } from "../../query/types.ts";
import { FORMAT_WORDS } from "../../simulation/words.ts";

/** The note in place of withheld sentences, after the first in a conversation (which is the backstory's short). */
export const WITHHELD = "I only give figures I've just looked up.";

type Kind = "currency" | "count" | "plain" | "fraction";
const KINDS: Record<Measure, Kind> = {
  revenue: "currency",
  avg_order_value: "currency",
  units: "count",
  orders: "count",
  checkouts: "count",
  avg_discount: "fraction",
  avg_rating: "plain",
  orders_per_day: "plain",
  ratings: "count",
};
const NOUNS: Record<Measure, string> = {
  revenue: "revenue",
  avg_order_value: "average order value",
  units: "units",
  orders: "orders",
  checkouts: "checkouts",
  avg_discount: "average discount",
  avg_rating: "average rating",
  orders_per_day: "orders per day",
  ratings: "ratings",
};

const ROUNDINGS = [10, 100, 1_000, 10_000, 100_000, 1_000_000];
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const twoPlaces = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const onePlace = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

/** A magnitude in the measure's unit, optionally rounded to a power of ten ("about $160,000"). */
function amount(kind: Kind, value: number, round?: number): string {
  const v = Math.abs(value);
  if (round) {
    const r = Math.round((kind === "fraction" ? v * 100 : v) / round) * round;
    return `about ${kind === "currency" ? `$${whole.format(r)}` : kind === "fraction" ? `${whole.format(r)}%` : whole.format(r)}`;
  }
  if (kind === "currency") return money.format(v);
  if (kind === "count") return whole.format(v);
  if (kind === "fraction") return `${onePlace.format(v * 100)}%`;
  return twoPlaces.format(v);
}
const signed = (kind: Kind, value: number, round?: number) =>
  value < 0 ? `minus ${amount(kind, value, round)}` : amount(kind, value, round);

type Row = Record<string, unknown>;
/** See Refs.describe. */
interface RefInfo {
  /** It renders a measure's value (a figure), not a label or a row count. */
  value: boolean;
  /** That value is in dollars (revenue, average order value). */
  currency: boolean;
  /** A list price: the row's own subjects, the one it must be named with, and its format's words. */
  price?: { own: string[]; subject: string | null; format: string | null };
  /** An edition or title label. */
  subject?: string;
  /** A format label, as running text says it ("trade paperback"). */
  format?: string;
}
/** The title in an edition label, "Post Alley (Hardcover)" → "Post Alley". */
const editionTitle = (edition: string) =>
  /^(.*?)\s*\([^()]*\)\s*$/.exec(edition)?.[1]?.trim() || null;
/** The format in an edition label, "Post Alley (Trade paperback)" or "Heliotrope Pajamas (Paperback, 2181)", as running text says it. */
const editionFormat = (edition: string) => {
  const m = /\(([^,()]+)(?:,[^()]*)?\)\s*$/.exec(edition);
  return m ? (FORMAT_WORDS[m[1]!.trim()] ?? null) : null;
};
interface Lookup {
  /** Its place in this answer's lookups: text that arrived before it can't cite it. */
  seq: number;
  /** Whether the rows hold every group, so "the highest" can be said of them. */
  complete: boolean;
  name: "query_data" | "compare_data";
  /** The first measure: a single-measure lookup's only one. */
  measure: Measure;
  /** Every measure the lookup asked for, the first first (Sim's `also`): one for compare_data. */
  measures: Measure[];
  dims: string[];
  rows: Map<string, Row>;
  ordered: Row[];
  /** compare_data's total figures, or a query_data lookup's first measure's total. */
  total: unknown;
  /** query_data: each measure's total. */
  totals: Map<Measure, unknown>;
  /** Filter values the data confirmed: a one-value filter on a lookup that found something. */
  filtered: Map<string, string>;
  /** compare_data: the compared values, where the data had something on that side (null otherwise). */
  from: string | null;
  to: string | null;
  /** query_data: what each average's n counts ("ratings"), for the averages among its measures. */
  units: Map<Measure, Unit>;
  /** query_data: each average's total evidence (n, range_low, range_high, range_none). */
  totalEvidence: Map<Measure, Row>;
  /**
   * Several measures: the tool server names each one's evidence fields by measure (`avg_rating_n`), in a row and at
   * the top, since one bare `n` couldn't say whose it is (withEvidence in tools/server.ts).
   */
  several: boolean;
}

const EVIDENCE_FIELDS = ["n", "range_low", "range_high", "range_none"] as const;
/** One measure's evidence fields from a row (or the top of a lookup), by the names the tool server gave them. */
const evidenceOf = (row: Row, measure: Measure, several: boolean): Row =>
  Object.fromEntries(EVIDENCE_FIELDS.map((f) => [f, row[several ? `${measure}_${f}` : f]]));

/** A ref, parsed: its lookup, its row number ("" for the total), and up to two fields ("a3.avg_rating.n"). */
interface ParsedRef {
  id: string;
  row: string;
  field: string;
  sub: string | undefined;
  round: number | undefined;
}
const REF_SHAPE = /^([a-z]+)(\d*)((?:\.[a-z_]+){0,3})(?:\|round:(\d+))?$/;
function parseRef(ref: string): ParsedRef | null {
  const m = REF_SHAPE.exec(ref);
  if (!m) return null;
  const [, id, row, dotted, roundText] = m;
  let path = dotted ? dotted.slice(1).split(".") : [];
  // "b.total.change" is "b.change", and "a.total.revenue" is "a.revenue": the total is what a ref without a row means.
  if (!row && path[0] === "total" && path.length > 1) path = path.slice(1);
  if (path.length > 2) return null;
  const field = (path[0] ?? "").replace(/^total_/, "");
  return {
    id: id!,
    row: row!,
    field,
    sub: path[1],
    round: roundText === undefined ? undefined : Number(roundText),
  };
}
const MEASURE_PARTS = ["n", "range", "max", "min"] as const;
type MeasurePart = "" | (typeof MEASURE_PARTS)[number];
/**
 * What a query_data ref's figure is: which measure, and what of it (its value, n, range, max or min). A measure is
 * named by its column ("a3.units", "a.avg_rating.n"), or, in a lookup of one measure, left out ("a3", "a.total",
 * "a3.n"). In a lookup of several, a ref that names no measure resolves to nothing: it never picks one (Goldy's
 * brief, 12 Nov). Null if the ref names no figure.
 */
function figureOf(lookup: Lookup, field: string, sub: string | undefined) {
  const part = (p: string | undefined): MeasurePart | null =>
    p === undefined
      ? ""
      : (MEASURE_PARTS as readonly string[]).includes(p)
        ? (p as MeasurePart)
        : null;
  if ((lookup.measures as string[]).includes(field)) {
    const what = part(sub);
    return what === null ? null : { measure: field as Measure, what, named: true };
  }
  if (sub !== undefined || lookup.measures.length > 1) return null;
  if (field === "" || field === "total")
    return { measure: lookup.measure, what: "" as const, named: false };
  const what = part(field);
  return what ? { measure: lookup.measure, what, named: false } : null;
}

/** What an average's n counts (query/evidence.ts's units), and one of it. */
const UNITS = {
  ratings: "rating",
  orders: "order",
  "sale lines": "sale line",
  days: "day",
} as const;
type Unit = keyof typeof UNITS;
const isUnit = (v: unknown): v is Unit => typeof v === "string" && Object.hasOwn(UNITS, v);
/** A likely range's ends, to one decimal place as Plot's copy has them ("3.9 to 4.3 stars"). */
const stars = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const starsFine = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const label = (v: unknown) => (v === null || v === undefined ? "Unknown" : String(v));
const join = (names: string[]) =>
  names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

/**
 * What each average's n counts, as the tool server said: `unit` for a lookup of one measure, and for several,
 * `evidence_units` keyed by measure. A unit that isn't the measure's own average's is ignored.
 */
function unitsOf(name: string, out: Row, measures: Measure[], several: boolean) {
  const units = new Map<Measure, Unit>();
  if (name !== "query_data") return units;
  const given = several ? out.evidence_units : { [measures[0]!]: out.unit };
  if (!given || typeof given !== "object") return units;
  for (const m of measures) {
    const unit = (given as Row)[m];
    if (isUnit(unit) && evidenceUnit(m) === unit) units.set(m, unit);
  }
  return units;
}
/** The refs this answer's successful lookups returned, and the period names they confirm. */
export class Refs {
  private readonly lookups = new Map<string, Lookup>();
  /** Period names, with the lookup that first returned each. */
  private readonly periods = new Map<string, number>();
  /** Titles the data returned (folded), with the lookup that first returned each: see knownTitles. */
  private readonly titles = new Map<string, number>();

  /** How many lookups have come back: stamp text with it when it arrives. */
  get known(): number {
    return this.lookups.size;
  }

  /** Whether a period name had been returned by a lookup that came back before text stamped `known`. */
  hasPeriod(name: string, known: number): boolean {
    const seq = this.periods.get(name);
    return seq !== undefined && seq < known;
  }
  /**
   * Titles the data returned before text stamped `known`, longest first. A title is the data's own string, so it
   * may be named in prose even with digits in it ("9803 North Millworks Road", Probe's Q2 red-team); only an
   * exact title from this answer's lookups, and only one with words in it, so a made-up or bare-number "title"
   * can't carry a figure.
   */
  knownTitles(known: number): string[] {
    return [...this.titles]
      .filter(([, seq]) => seq < known)
      .map(([t]) => t)
      .sort((a, b) => b.length - a.length);
  }
  hasQuarter(quarter: string, known: number): boolean {
    return [...this.periods].some(([name, seq]) => seq < known && name.endsWith(`-${quarter}`));
  }

  /**
   * What a ref points at, for the price checks (Probe's #225): whether it renders a measure's value (and whether
   * that's in dollars), a book's list price (with the row's own subjects and format, for the pairing check), or
   * a subject (an edition or title label). Null if it doesn't resolve.
   */
  describe(ref: string, known = Infinity): RefInfo | null {
    const parsed = parseRef(ref);
    if (!parsed) return null;
    const { id, row: rowNumber, field } = parsed;
    const lookup = this.lookups.get(id);
    if (!lookup || lookup.seq >= known) return null;
    const row = rowNumber ? lookup.rows.get(id + rowNumber) : undefined;
    if (rowNumber && !row) return null;
    const isLabel =
      field !== "" && ((row && lookup.dims.includes(field)) || lookup.filtered.has(field));
    const value = !isLabel && field !== "rows";
    // The ref's own measure, when it names one ("a3.revenue"), for whether it's in dollars.
    const measure = (lookup.measures as string[]).includes(field)
      ? (field as Measure)
      : lookup.measure;
    const info: RefInfo = { value, currency: value && KINDS[measure] === "currency" };
    if (!isLabel) return info;
    const at = (dim: string) =>
      row && lookup.dims.includes(dim) ? label(row[dim]) : lookup.filtered.get(dim);
    if (field === "list_price") {
      // The row's most specific subject: its edition if the lookup grouped by edition, else its title.
      const edition = at("edition");
      const own = [edition, edition && editionTitle(edition), at("title")].filter(
        (s): s is string => !!s,
      );
      const format = edition
        ? editionFormat(edition)
        : at("format")
          ? (FORMAT_WORDS[at("format")!] ?? null)
          : null;
      info.price = { own, subject: own[0] ?? null, format };
    }
    if (field === "edition" || field === "title") info.subject = at(field);
    if (field === "format")
      info.format = FORMAT_WORDS[at("format") ?? ""] ?? at("format")?.toLowerCase();
    return info;
  }

  /** Every edition and title label this answer's rows and confirmed filters hold, longest first. */
  subjects(known: number): string[] {
    const all = new Set<string>();
    for (const lookup of this.lookups.values()) {
      if (lookup.seq >= known) continue;
      for (const dim of ["edition", "title"]) {
        const values = [
          ...(lookup.dims.includes(dim) ? lookup.ordered.map((row) => row[dim]) : []),
          lookup.filtered.get(dim),
        ];
        for (const v of values) {
          if (typeof v !== "string") continue;
          all.add(v);
          // The title inside an edition label is a book named too ("Heliotrope Pajamas", Probe's review of #228).
          if (dim === "edition" && editionTitle(v)) all.add(editionTitle(v)!);
        }
      }
    }
    return [...all].sort((a, b) => b.length - a.length);
  }

  /** The two compared values of a comparison, where the data had something there (null otherwise). */
  compared(ref: string): { from: string | null; to: string | null } | null {
    const lookup = this.lookups.get(ref);
    return lookup?.name === "compare_data" ? { from: lookup.from, to: lookup.to } : null;
  }

  /** Adds a successful tool call. `input` is the model's (checked by the tool server); `output` is ours. */
  addTool(name: string, input: unknown, output: unknown) {
    if (
      (name !== "query_data" && name !== "compare_data") ||
      !output ||
      typeof output !== "object" ||
      !input ||
      typeof input !== "object"
    )
      return;
    const out = output as Row;
    const args = input as Row;
    const measure = args.measure;
    if (
      typeof out.ref !== "string" ||
      typeof measure !== "string" ||
      !(measure in KINDS) ||
      !Array.isArray(out.rows)
    )
      return;
    // Several measures (Sim's `also`): only on query_data, each a known measure, distinct, with each one's total.
    const also = args.also;
    if (also !== undefined && (name !== "query_data" || !Array.isArray(also))) return;
    const measures = [measure, ...((also as unknown[] | undefined) ?? [])];
    if (
      measures.length > 4 ||
      !measures.every((m) => typeof m === "string" && Object.hasOwn(KINDS, m)) ||
      new Set(measures).size !== measures.length
    )
      return;
    const several = measures.length > 1;
    const totals = new Map<Measure, unknown>();
    if (name === "query_data") {
      if (several) {
        const given = out.totals;
        if (!given || typeof given !== "object") return;
        for (const m of measures as Measure[]) totals.set(m, (given as Row)[m]);
      } else totals.set(measure as Measure, out.total);
    }
    const rows = out.rows as Row[];
    const seq = this.lookups.size;
    const period = (name: string) => {
      if (!this.periods.has(name)) this.periods.set(name, seq);
    };
    const title = (name: string) => {
      const folded = fold(name).trim();
      if (/\p{L}{3}/u.test(folded) && !this.titles.has(folded)) this.titles.set(folded, seq);
    };
    const dims = Array.isArray(args.by)
      ? (args.by as unknown[]).filter((d): d is string => typeof d === "string")
      : [];
    let from: string | null = null;
    let to: string | null = null;
    if (name === "compare_data") {
      // The compared values as the data's rows returned them (the tool server takes them from the rows).
      const labels = (out.labels ?? {}) as Row;
      from = typeof labels.from === "string" ? labels.from : null;
      to = typeof labels.to === "string" ? labels.to : null;
      if (args.across === "quarter" || args.across === "month")
        for (const p of [from, to]) if (p) period(p);
      if (args.across === "title") for (const t of [from, to]) if (t) title(t);
    }
    // Period names come from returned rows, and one-value filters the data confirmed (below); never captions.
    // Months name their year ("2193-04"), so like quarters they are period names.
    for (const row of rows)
      for (const key of ["quarter", "month"])
        if (typeof row[key] === "string") period(row[key] as string);
    // An edition label is the data's string too ("Heliotrope Pajamas (Paperback, 2181)"), named in prose as a title is (Probe's #225, item 4).
    for (const row of rows)
      for (const key of ["title", "edition"])
        if (typeof row[key] === "string") title(row[key] as string);
    // A filter value is the model's, so it's a label only when it alone was asked for and the data had
    // something there (with several values, any one could be the one that matched).
    const filtered = new Map<string, string>();
    const found =
      name === "query_data"
        ? [...totals.values()].some((t) => isNum(t) && t !== 0)
        : rows.length > 0 ||
          Object.values((out.total ?? {}) as Row).some((v) => isNum(v) && v !== 0);
    if (found && args.filter && typeof args.filter === "object") {
      for (const [dim, values] of Object.entries(args.filter as Row))
        if (Array.isArray(values) && values.length === 1 && typeof values[0] === "string")
          filtered.set(dim, values[0]);
    }
    const quarter = filtered.get("quarter");
    if (quarter) period(quarter);
    const month = filtered.get("month");
    if (month) period(month);
    for (const key of ["title", "edition"]) {
      const named = filtered.get(key);
      if (named) title(named);
    }
    this.lookups.set(out.ref, {
      seq,
      complete: out.complete === true,
      name,
      measure: measure as Measure,
      measures: measures as Measure[],
      dims,
      rows: new Map(rows.filter((r) => typeof r.ref === "string").map((r) => [r.ref as string, r])),
      ordered: rows,
      total: out.total,
      totals,
      filtered,
      from,
      to,
      units: unitsOf(name, out, measures as Measure[], several),
      // The total's evidence, its agreeing-ratings word included, as a row's (Audit, #347).
      totalEvidence: new Map(
        (measures as Measure[]).map((m) => [m, evidenceOf(out, m, several)] as const),
      ),
      several,
    });
  }

  /**
   * Renders one ref ("a2", "b.change", "a1.genre", "a.total|round:1000"), or null if this answer has no such ref
   * or its lookup hadn't come back when the text citing it arrived (`known`, from the text's stamp).
   */
  render(ref: string, known = Infinity): string | null {
    const parsed = parseRef(ref);
    if (!parsed) return null;
    const { id, row: rowNumber, field, sub, round } = parsed;
    if (round !== undefined && !ROUNDINGS.includes(round)) return null;
    const lookup = this.lookups.get(id);
    if (!lookup || lookup.seq >= known) return null;
    const oneField = sub === undefined && field !== "";
    if (rowNumber) {
      const row = lookup.rows.get(id + rowNumber);
      if (!row) return null;
      if (oneField && lookup.dims.includes(field)) return round ? null : label(row[field]);
      if (oneField && lookup.filtered.has(field)) return round ? null : lookup.filtered.get(field)!;
      if (lookup.name === "query_data") {
        // A row's figure, as {{a1}} or by its measure's column, {{a1.revenue}} (Probe's #252 red-team), and its
        // evidence, {{a1.n}} or {{a1.avg_rating.n}}. A measure the lookup didn't ask for doesn't resolve, and in a
        // lookup of several, neither does a figure that names no measure.
        if (field === "total") return null;
        const figure = figureOf(lookup, field, sub);
        if (!figure || figure.what === "max" || figure.what === "min") return null;
        const value = row[figure.measure];
        if (figure.what === "n" || figure.what === "range")
          return round
            ? null
            : this.evidence(
                lookup,
                figure.measure,
                evidenceOf(row, figure.measure, lookup.several),
                figure.what,
                value,
              );
        return isNum(value) ? signed(KINDS[figure.measure], value, round) : null;
      }
      if (sub !== undefined) return null;
      if (field === "n" || field === "range") return null;
      return this.comparison(
        lookup,
        row,
        field,
        round,
        lookup.dims.map((d) => label(row[d])).join(", "),
      );
    }
    if (field === "rows" && sub === undefined)
      return round ? null : whole.format(lookup.ordered.length);
    if (oneField && lookup.filtered.has(field)) return round ? null : lookup.filtered.get(field)!;
    if (lookup.name === "query_data") {
      // The total ({{a.total}}, or {{a.revenue}} by its measure), its evidence, and the row with the most or least.
      if (field === "") return null;
      const figure = figureOf(lookup, field, sub);
      if (!figure) return null;
      const { measure, what } = figure;
      const total = lookup.totals.get(measure);
      if (what === "n" || what === "range")
        return round
          ? null
          : this.evidence(lookup, measure, lookup.totalEvidence.get(measure) ?? {}, what, total);
      if (what === "max" || what === "min") return this.extreme(lookup, measure, what, round);
      return isNum(total) ? signed(KINDS[measure], total, round) : null;
    }
    if (sub !== undefined) return null;
    if (field === "n" || field === "range") return null;
    if (field === "largest_fall" || field === "largest_rise")
      return this.largest(lookup, field, round);
    if (field === "largest_fall_percent" || field === "largest_rise_percent")
      return round ? null : this.largestPercent(lookup, field);
    return this.comparison(lookup, (lookup.total ?? {}) as Row, field, round, "");
  }

  private comparison(
    lookup: Lookup,
    figures: Row,
    field: string,
    round: number | undefined,
    rowName: string,
  ): string | null {
    const kind = KINDS[lookup.measure];
    const noun = NOUNS[lookup.measure];
    const { from, to, change, percent_change: percent } = figures;
    // A change within noise, as the data judged it: "within noise", and nothing at all for a clear change or one
    // that can't be judged, so the model can't call a difference real or significant (Plot's copy, section 4).
    if (field === "noise") return round || figures.noise !== "within" ? null : "within noise";
    if (field === "from" || field === "to")
      return isNum(figures[field]) ? signed(kind, figures[field] as number, round) : null;
    if (!isNum(change)) return null;
    if (field === "change")
      return change > 0
        ? `rose by ${amount(kind, change, round)}`
        : change < 0
          ? `fell by ${amount(kind, change, round)}`
          : "was unchanged";
    if (field === "percent") {
      if (!isNum(percent) || round) return null;
      if (percent === 0) return "no change";
      if (Math.abs(percent) < 0.05) return "a change of less than 0.1%";
      return `a ${percent > 0 ? "rise" : "fall"} of ${onePlace.format(Math.abs(percent))}%`;
    }
    if (field === "from_vs_to" || field === "to_vs_from") {
      if (!isNum(from) || !isNum(to) || !lookup.from || !lookup.to) return null;
      const [first, second, difference] =
        field === "from_vs_to"
          ? [lookup.from, lookup.to, from - to]
          : [lookup.to, lookup.from, to - from];
      const where = rowName ? `For ${rowName}, ` : "";
      if (difference === 0) return `${where}${first} and ${second} had the same ${noun}`;
      const x = amount(kind, difference, round);
      if (kind === "count")
        return `${where}${first} had ${x} ${difference > 0 ? "more" : "fewer"} ${noun} than ${second}`;
      return `${where}${first}'s ${noun} was ${x} ${difference > 0 ? "higher" : "lower"} than ${second}'s`;
    }
    return null;
  }

  /**
   * How much evidence is behind an average (David, 3 Nov 2026: "Show n next to averages"): `n`, "212 ratings" or
   * "1 rating", and for average rating its likely range (95%), "a likely range of 3.9 to 4.3 stars". Only an average's lookup has
   * them; anything else, or a figure without them, doesn't resolve.
   */
  private evidence(
    lookup: Lookup,
    measure: Measure,
    figures: Row,
    field: "n" | "range",
    value: unknown,
  ): string | null {
    const unit = lookup.units.get(measure);
    if (!unit) return null;
    if (field === "n") {
      const n = figures.n;
      return typeof n === "number" && Number.isSafeInteger(n) && n >= 0
        ? `${whole.format(n)} ${n === 1 ? UNITS[unit] : unit}`
        : null;
    }
    if (measure !== "avg_rating") return null;
    const { range_low: low, range_high: high, range_none: none, n } = figures;
    // Every rating the same: no likely range, and the clause says why (Plot, #343). Only where the tool server said
    // so ("agree", from a standard error of exactly 0 over two ratings or more), with a whole-star average; a range
    // that's merely missing is withheld.
    if (none === "agree") {
      if (typeof n !== "number" || !Number.isSafeInteger(n) || n < 2) return null;
      if (!isNum(value) || !Number.isInteger(value) || value < 1 || value > 5) return null;
      const all = n === 2 ? "both ratings are" : `all ${whole.format(n)} ratings are`;
      return `no likely range, since ${all} ${value} star${value === 1 ? "" : "s"}`;
    }
    if (!isNum(low) || !isNum(high) || low > high) return null;
    // The phrase comes with it: "likely range" in the model's own words is withheld (EVIDENCE_WORDS). One decimal
    // place, or two when one would make both ends the same: never "4.2 to 4.2 stars" (Plot).
    const format = stars.format(low) === stars.format(high) ? starsFine : stars;
    return `a likely range of ${format.format(low)} to ${format.format(high)} stars`;
  }

  // Rankings are claims about every group, so they're made only over complete results; otherwise the ref
  // fails closed.
  private largest(
    lookup: Lookup,
    field: "largest_fall" | "largest_rise",
    round?: number,
  ): string | null {
    if (!lookup.dims.length || !lookup.complete) return null;
    const fall = field === "largest_fall";
    const moved = lookup.ordered.filter(
      (r) => isNum(r.change) && (fall ? (r.change as number) < 0 : (r.change as number) > 0),
    );
    if (!moved.length) return fall ? "none of them fell" : "none of them rose";
    const most = Math.max(...moved.map((r) => Math.abs(r.change as number)));
    const names = moved
      .filter((r) => Math.abs(r.change as number) === most)
      .map((r) => lookup.dims.map((d) => label(r[d])).join(", "));
    return `${join(names)} ${fall ? "fell" : "rose"} the most, by ${amount(KINDS[lookup.measure], most, round)}`;
  }

  private largestPercent(
    lookup: Lookup,
    field: "largest_fall_percent" | "largest_rise_percent",
  ): string | null {
    if (!lookup.dims.length || !lookup.complete) return null;
    const fall = field === "largest_fall_percent";
    const moved = lookup.ordered.filter(
      (r) =>
        isNum(r.percent_change) &&
        (fall ? (r.percent_change as number) < 0 : (r.percent_change as number) > 0),
    );
    if (!moved.length) return fall ? "none of them fell" : "none of them rose";
    const most = Math.max(...moved.map((r) => Math.abs(r.percent_change as number)));
    const names = moved
      .filter((r) => Math.abs(r.percent_change as number) === most)
      .map((r) => lookup.dims.map((d) => label(r[d])).join(", "));
    return `${join(names)} ${fall ? "fell" : "rose"} the most in percent, ${fall ? "a fall" : "a rise"} of ${onePlace.format(most)}%`;
  }

  private extreme(
    lookup: Lookup,
    measure: Measure,
    field: "max" | "min",
    round?: number,
  ): string | null {
    const rows = lookup.ordered.filter((r) => isNum(r[measure]));
    if (!lookup.dims.length || !rows.length || !lookup.complete) return null;
    const values = rows.map((r) => r[measure] as number);
    const target = field === "max" ? Math.max(...values) : Math.min(...values);
    const names = rows
      .filter((r) => r[measure] === target)
      .map((r) => lookup.dims.map((d) => label(r[d])).join(", "));
    const kind = KINDS[measure];
    const word =
      kind === "count"
        ? field === "max"
          ? "the most"
          : "the fewest"
        : field === "max"
          ? "the highest"
          : "the lowest";
    return `${join(names)} had ${word} ${NOUNS[measure]}, ${signed(kind, target, round)}`;
  }
}

const NUMBER_WORDS =
  "zero|one|ones|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundreds?|thousands?|millions?|billions?|dozens?|half|halves|halved|twice|thrice|double[sd]?|doubling|triple[sd]?|tripling|treble[sd]?|trebling|quadruple[sd]?|quadrupling|quintuple[sd]?|sextuple[sd]?|single|thirds?|fourths?|fifths?|sixths?|sevenths?|eighths?|ninths?|tenths?|eleventh|twelfth|\\w+teenth|\\w+tieth|hundredths?|thousandths?|millionths?|nil|fortnights?";
const DIRECTION_WORDS =
  "higher|highest|lower|lowest|more|most|less|least|fewer|fewest|greater|greatest|larger|largest|bigger|biggest|smaller|smallest|rise|rises|rising|rose|risen|fall|falls|falling|fell|fallen|up|down|increase|increases|increased|increasing|decrease|decreases|decreased|decreasing|grow|grows|grew|grown|growing|growth|drop|drops|dropped|dropping|decline|declines|declined|declining|gain|gains|gained|lose|loses|lost|loss|losses|above|below|exceed|exceeds|exceeded|beat|beats|trail|trails|trailed|outsold|outperformed|surge|surges|surged|jump|jumps|jumped|climb|climbs|climbed|dip|dips|dipped|slump|slumps|slumped|plunge|plunges|plunged|shrink|shrinks|shrank|shrunk|slip|slips|slipped|tumble|tumbles|tumbled|soar|soars|soared|edged|outpace|outpaces|outpaced|lag|lags|lagged|lagging|overtake|overtakes|overtook|overtaken|surpass|surpasses|surpassed|sink|sinks|sank|sunk|better|worse|peak|peaks|peaked|bottomed|unchanged|flat|steady|top|bottom|best|worst|ahead|behind|cheap|cheaper|cheapest|cheaply|pricey|pricier|priciest|costly|costlier|costliest|expensive|inexpensive|affordable|bargain|bargains|budget|premium|markdown|markdowns|buck|bucks";
// Digits in any script and number symbols (after NFKC, so "１６１" and "¾" are caught), fractions written with
// "quarter", "a couple", "a score of", "a pair of", and "-fold".
const QUANTITY =
  "\\ba quarter\\b|\\bquarters? of\\b|\\ba couple\\b|\\ba (?:score|pair) of\\b|\\w*-?fold\\b";
const BANNED = new RegExp(
  `\\p{Nd}|\\p{No}|[$%€£¥{}⁄]|\\b(?:${NUMBER_WORDS}|${DIRECTION_WORDS})\\b|${QUANTITY}`,
  "iu",
);
/**
 * Roman numerals in capitals ("XX", and "XII" from a folded "Ⅻ"): two letters or more, so "I" stays a word, and
 * only whole valid numerals, so "DID", "MILD" and "CIVIL" pass. "MIX" is the one common word that's also one.
 */
const ROMAN =
  /\b(?!MIX\b)(?=[MDCLXVI]{2,}\b)M{0,4}(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3})(?<=\b[MDCLXVI]{2,})\b/u;
/**
 * Look-alike letters (Probe's and Audit's reviews of #229 and #235). The checks read a plain copy, with accents
 * and other marks stripped ("hìgher" is "higher"), and any letter that's still not A to Z withholds the text:
 * another script ("fivе" with a Cyrillic е), and Latin small capitals and phonetic letters ("ꜰɪᴠᴇ", "hɪgher"),
 * which NFKD keeps. The catalog's one other letter, the é in an author's name (Karénine), is plain e here.
 */
const plain = (text: string) => text.normalize("NFKD").replace(/\p{M}/gu, "");
const FOREIGN = /(?![A-Za-z])\p{L}/u;
const banned = (text: string) => {
  const p = plain(text);
  return FOREIGN.test(p) || BANNED.test(p) || ROMAN.test(p);
};
// Exact phrases allowed despite their words, in exact contexts only.
// "Look up" only as the act of looking something up (Audit's and Probe's reviews of #244 and #260):
// - with its object between ("look it up", "looked things up");
// - after "to", "let me" or at a sentence's start, followed by what's looked up ("to look up the figures", "Let me
//   look up revenue"): never a time or "sales", which the idiom takes ("sales are looking up each month");
// - or with I, we or you as its subject, a helper or two between at most ("I looked up", "I've just looked up",
//   "I'd like to look up", "I'm looking up").
// Otherwise it's the improvement idiom ("sales are looking up", "revenue could look up", "started to look up").
const SUBJECT = String.raw`(?:i|i['’]m|i['’]ve|i['’]d|i['’]ll|we|we['’]re|we['’]ve|you|you['’]re|you['’]ve)`;
// "only" for Dewey's own refusal, "I only look up what's already happened" (Plot's line, after #383).
const HELPER = String.raw`(?:just|also|only|then|now|can|can['’]t|could|couldn['’]t|will|would|did|didn['’]t|do|don['’]t|like\s+to|want\s+to|need\s+to|have\s+to|had\s+to|tried\s+to|try\s+to|going\s+to)`;
const LOOKED_UP_THING = String.raw`(?:the\s+|its\s+|their\s+)?(?:revenue|units|orders|average|discounts?|ratings|checkouts|figures?|numbers?|totals?|titles?|genres?|formats?|publishers?|editions?|prices?|authors?|series|data|terminal|ledger)\b`;
// The object form alone: all Alma's flavor needs, since its text never says "we look up" (Probe, after #244).
const LOOK_IT_UP = String.raw`\blook(?:s|ed|ing)? (?:it|them|that|things|everything) up\b`;
const LOOK_UP = String.raw`${LOOK_IT_UP}|(?<=(?:^\s*|\bto\s+|\blet\s+me\s+))look(?:s|ed|ing)? up(?=\s+${LOOKED_UP_THING})|\b${SUBJECT}(?:\s+${HELPER}){0,2}\s+look(?:s|ed|ing)? up\b`;
const ALLOWED = new RegExp(
  String.raw`${LOOK_UP}|\b(?:broken|break(?:s|ing)?(?: it)?) down by\b|\bin more detail(?=\s*(?:[.,;:!?]|$))`,
  "giu",
);
const REF = /\{\{([^{}]{1,40})\}\}/g;
/**
 * The whole ban, for other text a player is shown as fact-free flavor (Alma's): only "look it up" and "look
 * things up" are cleared first, since Alma's text never needs Dewey's "I looked up", and "we will look up" can be
 * the improvement idiom. Run it on NFKC-folded text.
 */
const FLAVOR_ALLOWED = new RegExp(LOOK_IT_UP, "giu");
export const hasBannedWord = (folded: string) => banned(folded.replace(FLAVOR_ALLOWED, " "));

/** Text as it will be read: compatibility forms ("７", "½") folded to plain ones before any check. */
// Invisible characters (a soft hyphen, a zero-width space, a word joiner, bidi controls) are dropped first: NFKC
// keeps them, so "fi\u00ADve" would read as "five" while slipping past every word check (Probe). The checks and
// the text shown both use this, so what's checked is what's shown.
const fold = (text: string) =>
  text.normalize("NFKC").replace(/\p{Default_Ignorable_Code_Point}/gu, "");
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Words that make a dollar figure a price (Probe's #225, with Sage's and Audit's additions).
const PRICE_WORDS =
  /\b(?:price[sd]?|pricing|costs?|costing|list(?:s|ed)? at|sells? for|sold for|retail(?:s|ed)?|pay(?:s|ing)?|paid|spend(?:s|ing)?|spent|charge[sd]?|charging|worth)\b/iu;
// A bound put on a figure: "costs under {{a2.list_price}}" claims a comparison the data didn't make.
const BOUND = /\b(?:under|over|at least|at most|up to)\s*$/iu;
// Format words as running text says them, with their plurals and synonyms, longest first, each with the format it
// names. A synonym that fits more than one format ("softcover": trade, mass market or plain paperback) names
// none, so it never matches a price's own format (Probe's review of #228).
const FORMAT_NAMES: Record<string, string> = {
  ...Object.fromEntries(Object.values(FORMAT_WORDS).map((f) => [f, f])),
  hardback: "hardcover",
  "hard cover": "hardcover",
  "hard-cover": "hardcover",
  "mass-market paperback": "mass market paperback",
  softcover: "soft cover",
  "soft cover": "soft cover",
  "soft-cover": "soft cover",
  softback: "soft cover",
  "soft-back": "soft cover",
};
const FORMATS = Object.entries(FORMAT_NAMES)
  .flatMap(
    ([word, format]) =>
      [
        [word, format],
        [`${word}s`, format],
      ] as const,
  )
  .sort((a, b) => b[0].length - a[0].length);
// In a sentence citing a list price, words that carry it over to another book (Probe's review of #228).
const CARRY_OVER =
  /\b(?:same|too|also|likewise|as well|(?:as|so) (?:does|do|did|is|are)|like|alike|other|others|another|every|all|each|both|either)\b/iu;
const wholeLabel = (text: string, flags: string) =>
  new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(text)}(?![\\p{L}\\p{N}])`, flags);

/**
 * Probe's #225: price can't be misstated, though it's a label a ref renders. A sentence is withheld when:
 * - "under", "over", "at least", "at most" or "up to" stands directly before a price or a figure;
 * - it has a price word and a dollar figure that isn't a price (revenue or average order value called a price);
 * - a list price isn't paired with its own book: an edition row's price needs its edition named (by ref, or its
 *   exact label), a title row's its title; no other edition or title from this answer may be named; and any
 *   format word, by ref or in prose, must be the price row's own format, matched whole ("paperback" isn't a trade
 *   paperback; a synonym that fits several formats, "softcover", fits none), for a book's price or a group's (a
 *   breakdown by format). The title inside an edition label counts as a book named. A book's price can't be
 *   carried over to another ("too", "the same as", "like", "the other editions"). A price with no book (a
 *   breakdown by price or format, or a confirmed filter) may sit only with no book named.
 */
function priceProblem(folded: string, refs: Refs, known: number): boolean {
  const cited = [...folded.matchAll(REF)].map((m) => ({
    at: m.index!,
    info: refs.describe(m[1]!.trim(), known),
  }));
  if (cited.some(({ at, info }) => (info?.price || info?.value) && BOUND.test(folded.slice(0, at))))
    return true;
  const prose = folded.replace(REF, " ");
  if (PRICE_WORDS.test(prose) && cited.some(({ info }) => info?.currency)) return true;
  const prices = cited.flatMap(({ info }) => (info?.price ? [info.price] : []));
  if (!prices.length) return false;
  // A book's price can't be carried over to another ("…, and Heliotrope Pajamas does too"); a price group's
  // words are about the group ("every title in $27.99"), so they stay.
  if (prices.some((p) => p.subject) && CARRY_OVER.test(prose)) return true;
  // The books the sentence names: by ref, and by exact label in its prose (longest first, each once).
  const named = cited.flatMap(({ info }) => (info?.subject ? [info.subject] : []));
  let rest = prose;
  for (const subject of refs.subjects(known)) {
    const pattern = wholeLabel(subject, "gu");
    if (pattern.test(rest)) {
      named.push(subject);
      rest = rest.replace(pattern, " ");
    }
  }
  // Format words: cited by ref ({{f1.format}}) or in the prose, whole phrases, longest first.
  const formats = cited.flatMap(({ info }) => (info?.format ? [info.format] : []));
  for (const [f, format] of FORMATS) {
    const pattern = wholeLabel(f, "giu");
    if (pattern.test(rest)) {
      formats.push(format);
      rest = rest.replace(pattern, " ");
    }
  }
  for (const price of prices) {
    // Every price, a book's or a group's: a format named beside it must be its own, and one without a format
    // can't be given one (Audit's review of #228: "Hardcovers at {{f2.list_price}}", f2 the trade paperback).
    if (formats.some((f) => f !== price.format)) return true;
    if (!price.subject) {
      if (named.length) return true;
      continue;
    }
    if (!named.includes(price.subject) || named.some((n) => !price.own.includes(n))) return true;
  }
  return false;
}

/** The own subjects of the book prices a sentence cites (empty if none). */
function bookPrices(folded: string, refs: Refs, known: number): string[] {
  return [...folded.matchAll(REF)].flatMap((m) => {
    const price = refs.describe(m[1]!.trim(), known)?.price;
    return price?.subject ? price.own : [];
  });
}

/** What a shown book price holds the sentences after it to (see carriesOver). */
export interface PriceContext {
  /** The book whose price was shown, for the next shown sentence: it may name no other book. */
  book: readonly string[];
  /** A book's price was shown in this paragraph: no carry-over words until it ends. */
  paragraph: boolean;
}
const NO_PRICE: PriceContext = { book: [], paragraph: false };

/**
 * A book's price can't be carried over to another (Probe's reviews of #228 and #235). A sentence with no price of
 * its own is withheld for a carry-over word ("The Lantern Hours does too.") anywhere in the paragraph after a
 * book's price, and for naming another book from this answer in the next shown sentence.
 */
function carriesOver(folded: string, refs: Refs, known: number, context: PriceContext): boolean {
  if ([...folded.matchAll(REF)].some((m) => refs.describe(m[1]!.trim(), known)?.price))
    return false;
  const prose = folded.replace(REF, " ");
  if ((context.paragraph || context.book.length) && CARRY_OVER.test(prose)) return true;
  if (!context.book.length) return false;
  const cited = [...folded.matchAll(REF)].flatMap(
    (m) => refs.describe(m[1]!.trim(), known)?.subject ?? [],
  );
  const named = [...cited, ...refs.subjects(known).filter((s) => wholeLabel(s, "u").test(prose))];
  return named.some((n) => !context.book.includes(n));
}

/** The context after a sentence: a shown price sets it, a shown sentence ends `book`, a withheld one leaves it, and a paragraph break clears it. */
export function nextPriceContext(
  context: PriceContext,
  result: { price: string[] } | null,
  sentence: string,
): PriceContext {
  if (/\n\s*\n/.test(sentence)) return NO_PRICE;
  if (!result) return context;
  return result.price.length
    ? { book: result.price, paragraph: true }
    : { book: [], paragraph: context.paragraph };
}

/**
 * Renders a sentence's refs and checks its own prose; null if it must be withheld. `known` is how many lookups
 * had come back when the sentence's text arrived (the earliest stamp among its chunks). `after` is what the prices
 * shown before it hold it to; the result's `price` is the book this sentence priced, for nextPriceContext.
 */
/**
 * Judgments about evidence, which only the data may make (David, 3 Nov 2026: "flag a comparison when the difference
 * is "within noise""): "within noise" comes from a comparison's ref ({{b.noise}}), how much data from {{a1.n}}, and
 * a likely range from {{a1.range}}. In the model's own words they're withheld, as is calling a difference
 * significant, real or a fluke, which the copy never says (Plot's copy, section 4).
 */
const EVIDENCE_WORDS = new RegExp(
  "\\b(?:" +
    [
      // Noise, chance and significance.
      "noise|noisy|(?:in)?significan(?:t|tly|ce)|statistic(?:s|al|ally)?|flukes?|(?:by|random|pure) chance",
      "random(?:ly|ness)?|(?:random|natural) variation|luck(?:y|ily)?|coincidences?|coincidental|blips?",
      // Whether a difference is real.
      "(?:real|clear|genuine|true|actual) differences?|(?:in)?conclusive(?:ly)?|robust(?:ly)?",
      // Not a bare "certainly", "trust" or "variation", which open and fill ordinary sentences (Audit, #337).
      "certainty|for certain|(?:is|are|was|were|that's|it's) certain|definite(?:ly)?",
      // How much data, and how far to trust it (Probe's red-team of #337).
      "(?:small|tiny|large|big) samples?|sample sizes?|too few|handful|plenty of (?:ratings|orders|data|sale lines|days)",
      "trustworthy|(?:to|can|can't|cannot|could|couldn't) trust|be trusted|solid(?:ly)?",
      "(?:un)?reliabl[ey]|confidence|confident(?:ly)?|uncertain(?:ty)?|meaningful(?:ly)?|meaningless",
      // Ranges, said by the model rather than by {{a1.range}}.
      "margin of error|standard error|likely range|intervals?|error bars?|give or take|plus or minus",
    ].join("|") +
    ")\\b",
  "iu",
);

/**
 * A forecast, which only the player makes (David, 3 Nov 2026: the plan's optional forecast is theirs, and Dewey
 * never proposes one). A past figure by ref is true, but "you should expect {{a4}} next quarter" makes it a
 * forecast. Words that name a forecast, and the quarter not yet played (which no lookup has data for), withhold a
 * sentence anywhere.
 */
const FORECAST_WORDS = new RegExp(
  "\\b(?:" +
    [
      "forecast(?:s|ed|ing)?|predict(?:s|ed|ing|ion|ions|able)?|projected|projections?|projecting",
      "expect(?:s|ed|ing|ation|ations)?|anticipat(?:e|es|ed|ing|ion)|estimat(?:e|es|ed|ing|ion|ions)|outlook",
      "next quarter(?:'s)?|the coming quarter|this coming quarter",
    ].join("|") +
    ")\\b",
  "iu",
);
/**
 * What a result will be or is headed for: a forecast only beside a figure, so these withhold a sentence with a ref
 * in it. "Revenue will be {{a1}}" is withheld, and "The table will be under this message" passes (Audit, #383); a
 * direction in the model's own words is withheld anyway.
 */
const FORECAST_CLAIMS = new RegExp(
  "\\b(?:" +
    [
      "(?:will|should|would|could|might|may|going to)(?: probably| likely| well| easily| still)? (?:be|sell|bring|reach|make|earn|come|hit|see|land|end|total|top|get|do|net|clear|beat|match|exceed)",
      // Planning cues beside a past figure turn it into a target (Probe's red-team of #383).
      "aim(?:s|ing)? (?:for|at)|plan(?:s|ning)? (?:for|on)|target(?:s|ing)?|next time|if (?:the |that |this )?(?:trend|pace|pattern)s? (?:continues?|holds?|keeps? up)|if (?:that|this|it) (?:continues|holds|keeps up)|keeps? up",
      "likely to|on track|on course|on pace|head(?:ed|ing|s)? (?:for|to|toward|towards)|set (?:for|to)",
    ].join("|") +
    ")\\b",
  "iu",
);

/**
 * Evidence qualifies one figure: {{e1.n}} the average {{e1}}, {{f1.noise}} the change {{f1.change}}. So a sentence
 * with an evidence ref passes only if every ref in it is that same row's, or for {{e.n}} that lookup's total, and
 * at least one of them isn't evidence: two true refs mustn't make a false sentence, "Poetry rose by 200, within
 * noise" with Mystery's flag (Probe's red-teams of #337). A sentence with no evidence ref is unaffected.
 */
function evidenceBound(refs: string[]): boolean {
  const parsed = refs.map((ref) => {
    const m = /^([a-z]+)(\d*)(?:\.([a-z_.]+))?(?:\|.*)?$/.exec(ref.trim());
    if (!m) return null;
    const path = (m[3] ?? "").replace(/^total[._]?/, "").split(".");
    // "a3.avg_rating.n" is avg_rating's evidence; "a3.n" a lookup of one measure's.
    const measure = path.find((p) => Object.hasOwn(KINDS, p)) ?? null;
    return { at: `${m[1]}${m[2]}`, field: path.at(-1)!, measure };
  });
  const isEvidence = (p: (typeof parsed)[number]) =>
    p !== null && ["n", "range", "noise"].includes(p.field);
  const evidence = parsed.filter(isEvidence);
  if (!evidence.length) return true;
  const at = evidence[0]!.at;
  // In a lookup of several measures, evidence names its measure, and qualifies only that measure's figure: no ref
  // in the sentence may name another ("{{a3.revenue}}, over {{a3.avg_order_value.n}}" would lend one the other's).
  const named = new Set(parsed.flatMap((p) => (p?.measure ? [p.measure] : [])));
  if (named.size > 1) return false;
  // And the row is in the sentence itself, by a ref of its own (its figure, or its name, {{e1.genre}}): an evidence
  // ref alone, or beside a name in prose, would attach to whatever came before ("Poetry rose by 200. That is
  // within noise."; Probe's second red-team of #337).
  return (
    parsed.every((p) => p !== null && p.at === at) &&
    parsed.some((p) => p !== null && !isEvidence(p))
  );
}

export function renderSentence(
  sentence: string,
  refs: Refs,
  known = Infinity,
  after: PriceContext = NO_PRICE,
): { text: string; refs: number; price: string[] } | null {
  let count = 0;
  let bad = false;
  const folded = fold(sentence);
  const rendered = folded.replace(REF, (_, ref: string) => {
    count++;
    const text = refs.render(ref.trim(), known);
    if (text === null) bad = true;
    return text ?? "";
  });
  if (bad) return null;
  if (!evidenceBound([...folded.matchAll(REF)].map((m) => m[1]!))) return null;
  if (priceProblem(folded, refs, known) || carriesOver(folded, refs, known, after)) return null;
  // Titles the data returned, exactly and whole, are the data's words, not the model's: cleared before the ban.
  let prose = folded.replace(REF, " ");
  for (const title of refs.knownTitles(known))
    prose = prose.replace(
      new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(title)}(?![\\p{L}\\p{N}])`, "gu"),
      " ",
    );
  prose = prose
    .replace(/\b\d{4}-Q[1-4]\b/g, (p) => (refs.hasPeriod(p, known) ? " " : p))
    .replace(/\b\d{4}-(?:0[1-9]|1[0-2])\b/g, (p) => (refs.hasPeriod(p, known) ? " " : p))
    .replace(/\bQ([1-4])\b/g, (q) => (refs.hasQuarter(q, known) ? " " : q))
    .replace(ALLOWED, " ");
  // The plain copy, as banned() reads it, so an accent can't slip a word past (Audit's review of #337).
  if (
    banned(prose) ||
    EVIDENCE_WORDS.test(plain(prose)) ||
    FORECAST_WORDS.test(plain(prose)) ||
    (count > 0 && FORECAST_CLAIMS.test(plain(prose)))
  )
    return null;
  // "Yes" or "No" is itself a claim: allowed only to open a sentence that is otherwise refs ("No, {{b.to_vs_from}}.").
  const answer = /^\s*(?:yes|no)\b/i.exec(prose);
  if (answer && (count === 0 || /\p{L}/u.test(prose.slice(answer[0].length)))) return null;
  return { text: rendered, refs: count, price: bookPrices(folded, refs, known) };
}

/**
 * Holds the reply a sentence at a time, renders its refs, and withholds any sentence whose prose has a figure
 * or direction of its own or whose refs this answer doesn't have, replacing a run of them with one note. Refs
 * are resolved when each sentence completes, so a ref cited before its lookup came back is withheld too.
 * `onWithheld` gets each withheld sentence, cleaned, so the server can keep it on the device (Probe's Q2 red-team).
 */
export function sentenceGate(
  refs: Refs,
  clean: (s: string) => string = (s) => s,
  onWithheld?: (sentence: string) => void,
  note: string = WITHHELD,
) {
  let held = "";
  // Where each held chunk starts, and how many lookups had come back when it arrived.
  let stamps: { at: number; known: number }[] = [];
  // One note per reply, however many sentences are withheld.
  let noted = false;
  let withheld = 0;
  let rendered = 0;
  // What the prices shown so far hold the next sentences to, so none can carry a price over.
  let after = NO_PRICE;
  const knownAt = (start: number, end: number) =>
    Math.min(
      ...stamps
        .filter((s, i) => s.at < end && (stamps[i + 1]?.at ?? Infinity) > start)
        .map((s) => s.known),
    );
  const check = (text: string) => {
    let out = "";
    // Whitespace after the note, kept until something follows it.
    let gap = "";
    let at = 0;
    for (const sentence of text.match(/[^]*?(?:[.!?]+(?:\s+|$)|\n+|$)/g) ?? []) {
      if (!sentence) continue;
      // A sentence may cite only lookups that had come back before its earliest chunk arrived.
      const result = renderSentence(sentence, refs, knownAt(at, at + sentence.length), after);
      at += sentence.length;
      after = nextPriceContext(after, result, sentence);
      if (result) {
        out += gap + result.text;
        rendered += result.refs;
        gap = "";
        continue;
      }
      withheld++;
      // What the model wrote, for the device's held record only: it never reaches the browser.
      onWithheld?.(clean(sentence.trim()));
      const trail = /\s*$/.exec(sentence)![0];
      if (noted) {
        // Dropped silently; right after the note, its break (a paragraph, say) is the one that follows.
        if (gap) gap = trail;
        continue;
      }
      out += gap + note;
      gap = trail;
      noted = true;
    }
    return clean(out + gap);
  };
  const take = (cut: number) => {
    const ready = held.slice(0, cut);
    const result = check(ready);
    held = held.slice(cut);
    // What's left starts partway into some chunk: it keeps that chunk's stamp, and later chunks keep theirs.
    const covering = stamps.filter((s) => s.at <= cut).at(-1);
    stamps =
      held && covering
        ? [
            { at: 0, known: covering.known },
            ...stamps.filter((s) => s.at > cut).map((s) => ({ at: s.at - cut, known: s.known })),
          ]
        : [];
    return result;
  };
  return {
    /** Takes a chunk, stamped with how many lookups had come back when it arrived; returns what can be shown. */
    push(chunk: string, known = refs.known): string {
      if (!chunk) return "";
      stamps.push({ at: held.length, known });
      held += chunk;
      // A sentence ends at ., ! or ? followed by whitespace (not "a1.genre"), or at a line break.
      const ends = [...held.matchAll(/[.!?]+\s+|\n+/g)];
      if (!ends.length) return "";
      const last = ends.at(-1)!;
      return take(last.index + last[0].length);
    },
    flush(): string {
      return held ? take(held.length) : "";
    },
    /** Sentences withheld so far. */
    get withheld() {
      return withheld;
    },
    /** Refs rendered so far. */
    get rendered() {
      return rendered;
    },
  };
}

/** Replaces `secret` in every string of a JSON-like value (wire events other than text). */
export function scrubDeep<T>(value: T, secret: string, replacement = "[hidden]"): T {
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return v.split(secret).join(replacement);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object")
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [walk(k), walk(x)]));
    return v;
  };
  return walk(value) as T;
}
