// The endless loop's model side (docs/design/endless.md, sections 2, 7 and 8): any quarter from Q1 2194
// on, Alma's event as conditions, goals anchored with no ratchet, the recovery goal, and the strikes.
// Pure and deterministic: a turn depends only on its quarter, seed, plan and event, and the data, so a
// save's quarters replay exactly. Q1 and Q2 2194 are played by their own engines, unchanged.
import type { BookshopData, DeepReadonly } from "~/bookshop/types";
import {
  AGAINST,
  applyConditions,
  changesOrders,
  conditionsOf,
  type Conditions,
  type TurnEvent,
} from "./conditions";
import { MONTH_NAMES, type QuarterCopy } from "./copy";
import { goalFor } from "./grading";
import { EVENT_COST, measures } from "./measures";
import { baseline, run, withRelease, YEAR, type QuarterNumber } from "./model";
import { picksLines, simulatePicks, simulateQ2, type PicksQuarter } from "./q2";
import { isQuarterName, quarterAt, quarterIndex, quarterNumber, type QuarterId } from "./quarters";
import { EFFECT_SEEDS, historyFor, holdLevers, prepare, simulateQuarter } from "./simulate";
import type {
  Certificate,
  MeasureId,
  Plan,
  Q2Plan,
  Q2SimulationResult,
  ReportCard,
  SimulatedLine,
  SimulationResult,
} from "./types";
import { FORMAT_WORDS, GENRE_WORDS } from "./words";
import { MEASURE_IDS } from "./types";

export type { TurnEvent } from "./conditions";

/**
 * Bumped whenever any quarter's lines for a fixed input change, so a save's replay that no longer matches
 * its stored hash can say the engine changed. A save keeps its outcomes, so a change only to their text
 * (an assumption's wording) needs no bump. The fingerprint tests pin it beside their hashes.
 */
export const ENGINE_VERSION = 1;

// The removal rule lives in a plain leaf, so the save store (plain Node in its tests) can use it too.
export { STRIKE_BELOW, removedAt, strikes } from "./strikes";
/** An event's expected effect on holding course may be at most this share of any measure's anchor (section 8). */
export const EVENT_BOUND = 0.1;
/** A measure that fell by more than this share earns a recovery goal (section 2). */
export const RECOVERY_FALL = 0.1;

export interface Turn {
  /** "2194-Q1" onward. */
  quarter: QuarterId;
  seed: number;
  /** M1's Plan in Q1 2194; Q2's form from Q2 2194 on. */
  plan: Plan | Q2Plan;
  /** The quarter's Alma record (its type, params, stretch and drop); null in Q1 and Q2 2194. */
  event: TurnEvent | null;
}

type Measures = Record<MeasureId, number>;

/** "2195-Q3" as its year and quarter. */
export function quarterParts(quarter: string): { year: number; quarter: QuarterNumber } {
  if (!isQuarterName(quarter)) throw new Error(`Not a playable quarter: ${quarter}`);
  return {
    year: YEAR + Math.floor(quarterIndex(quarter) / 4),
    quarter: quarterNumber(quarter) as QuarterNumber,
  };
}

const isLaunch = (t: { year: number; quarter: QuarterNumber }) => t.year === YEAR && t.quarter <= 2;
const byMeasure = (f: (id: MeasureId) => number) =>
  Object.fromEntries(MEASURE_IDS.map((id) => [id, f(id)])) as Measures;

interface Anchored {
  /** What scores 70: 2193 as sold, plus the new volume's and the event's expected effects on holding course. */
  anchor: Measures;
  /** The event's expected effect alone. */
  effect: Measures;
  conditions: Conditions;
}

const anchors = new WeakMap<DeepReadonly<BookshopData>, Map<string, Anchored>>();

/**
 * The quarter's anchor under its event (section 8): the mean, over EFFECT_SEEDS, of holding course with
 * the event's conditions minus without them, added to the quarter's anchor. About 40 runs, cached.
 */
export function anchorFor(
  quarter: QuarterId,
  event: TurnEvent | null,
  data: DeepReadonly<BookshopData>,
): Anchored {
  const t = quarterParts(quarter);
  const p = prepare(data, t.quarter, t.year);
  const conditions = conditionsOf(event, p.history);
  let cache = anchors.get(data);
  if (!cache) anchors.set(data, (cache = new Map()));
  const key = `${quarter}|${JSON.stringify(conditions)}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const effect = byMeasure(() => 0);
  // Only orders and the cost of goods can move holding course: it runs no author nights, so their fare can't.
  if (changesOrders(conditions) || conditions.costs.cogs) {
    const hold = holdLevers(t.quarter, t.year);
    for (const seed of EFFECT_SEEDS) {
      const base = withRelease(p.history, baseline(p.history, seed), seed);
      const of = (orders: typeof base, c: Conditions) =>
        measures(run(p.history, orders, seed, hold).orders, p.ratings, 0, 0, c.costs);
      const [withIt, without] = [
        of(applyConditions(p.history, base, seed, conditions), conditions),
        of(base, { costs: {} }),
      ];
      for (const id of MEASURE_IDS) effect[id] += (withIt[id] - without[id]) / EFFECT_SEEDS.length;
    }
  }
  const result = { anchor: byMeasure((id) => p.anchor[id] + effect[id]), effect, conditions };
  cache.set(key, result);
  return result;
}

/** "bound" when the event's expected effect on holding course passes 10% of any measure's anchor; the server then falls back. */
export function eventProblem(
  event: TurnEvent,
  quarter: QuarterId,
  data: DeepReadonly<BookshopData>,
): "bound" | null {
  const t = quarterParts(quarter);
  const p = prepare(data, t.quarter, t.year);
  const { effect } = anchorFor(quarter, event, data);
  return MEASURE_IDS.some((id) => Math.abs(effect[id]) > EVENT_BOUND * Math.abs(p.anchor[id]))
    ? "bound"
    : null;
}

/**
 * The stretched measure's goal (section 2). An extra stretch: the anchor plus its percent, at least the
 * usual step. A recovery goal: the anchor times (1 + drop / 100), never below the normal goal, and capped
 * at the anchor plus the record's percent, 20.
 */
export function goalsFor(
  anchor: Measures,
  quarterlyAverage: Measures,
  event: TurnEvent | null,
): Partial<Measures> {
  if (!event?.stretch) return {};
  const { measure, percent } = event.stretch;
  const a = anchor[measure];
  const normal = goalFor(a, quarterlyAverage[measure]);
  const up = (share: number) => a + share * Math.abs(a);
  const goal =
    event.drop === undefined
      ? Math.max(up(percent / 100), normal)
      : Math.max(normal, Math.min(up(event.drop / 100), up(percent / 100)));
  return { [measure]: goal };
}

const pct = (share: number) => `${Math.round(share * 100)}%`;
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The event's rule for the assumptions panel, in the server's words. */
function eventRule(event: TurnEvent | null, c: Conditions): string | undefined {
  const counted = "Alma's event this quarter; the goals count its expected effect.";
  if (c.genre) {
    const month = MONTH_NAMES[Number(c.genre.month) - 1];
    const change =
      c.genre.factor > 1 ? `${pct(c.genre.factor - 1)} higher` : `${pct(1 - c.genre.factor)} lower`;
    return `${capital(GENRE_WORDS[c.genre.genre] ?? c.genre.genre)} orders in ${month} are ${change} than the replay: ${counted}`;
  }
  if (c.weekday)
    return `${String(event!.params.weekday)} orders are ${pct(1 - c.weekday.factor)} lower than the replay all quarter: ${counted}`;
  if (c.costs.cogs)
    return `${capital(FORMAT_WORDS[c.costs.cogs.format] ?? c.costs.cogs.format)} copies cost the store ${pct(c.costs.cogs.rate)} of their list price, instead of 60%: ${counted}`;
  return undefined;
}

/** A later quarter's setup for Q2's engine: its anchor, goals, conditions and copy. */
function setupOf(turn: Turn, data: DeepReadonly<BookshopData>): PicksQuarter {
  const t = quarterParts(turn.quarter);
  const p = prepare(data, t.quarter, t.year);
  const { anchor, conditions } = anchorFor(turn.quarter, turn.event, data);
  const copy: QuarterCopy = {
    year: t.year,
    event: eventRule(turn.event, conditions),
    fare: conditions.costs.fare,
  };
  return {
    ...t,
    anchor,
    goals: goalsFor(anchor, p.quarterlyAverage, turn.event),
    conditions,
    copy,
  };
}

function checkLaunch(turn: Turn) {
  if (turn.event) throw new Error(`${turn.quarter} has no event`);
}

/**
 * The quarter's endless certificates (endless-copy.md, after scoring.md): Comeback for meeting a recovery
 * goal, and Weathered the Storm when every measure the event works against met its goal. Every event that
 * works against a measure is a storm, except author fares at or under the usual $200, which make the nights
 * no dearer, and any fare for a plan that ran no author nights, which it never touched. Certificates never
 * change the score.
 */
export function endlessCertificates(
  card: ReportCard,
  turn: Turn,
  ranNights: boolean,
): Certificate[] {
  const event = turn.event;
  if (!event) return [];
  const met = (id: MeasureId) => card.measures.find((m) => m.id === id)!.met;
  const certificates: Certificate[] = [];
  if (event.drop !== undefined && event.stretch && met(event.stretch.measure))
    certificates.push({
      id: "comeback",
      measure: event.stretch.measure,
      previous: quarterAt(quarterIndex(turn.quarter) - 1),
    });
  const against = MEASURE_IDS.filter((id) => (AGAINST[event.type] ?? []).includes(id));
  const touched =
    event.type !== "author_fares" || (ranNights && Number(event.params.cost) > EVENT_COST);
  if (against.length > 0 && touched && against.every(met))
    certificates.push({
      id: "weathered",
      measures: against,
      event: { type: event.type, params: { ...event.params } },
    });
  return certificates;
}

/** Plays a quarter under the plan, and under holding course from the same seed. */
export function simulateTurn(
  turn: Turn,
  data: DeepReadonly<BookshopData>,
): SimulationResult | Q2SimulationResult {
  const t = quarterParts(turn.quarter);
  if (isLaunch(t)) {
    checkLaunch(turn);
    return t.quarter === 1
      ? simulateQuarter(turn.plan as Plan, turn.seed, data)
      : simulateQ2(turn.plan as Q2Plan, turn.seed, data);
  }
  const result = simulatePicks(turn.plan as Q2Plan, turn.seed, data, setupOf(turn, data));
  const { plan, holdCourse } = result.outcome.reportCard;
  plan.certificates.push(
    ...endlessCertificates(plan, turn, (turn.plan as Q2Plan).levers.includes("events")),
  );
  holdCourse.certificates.push(...endlessCertificates(holdCourse, turn, false));
  return result;
}

/** The same lines as simulateTurn, without the report card or the anchor: for a save's replay and its hash. */
export function linesOfTurn(
  turn: Turn,
  data: DeepReadonly<BookshopData>,
): { lines: SimulatedLine[]; doNothingLines: SimulatedLine[] } {
  const t = quarterParts(turn.quarter);
  if (isLaunch(t)) {
    checkLaunch(turn);
    if (t.quarter === 2) return picksLines(turn.plan as Q2Plan, turn.seed, data);
    const { lines, doNothingLines } = simulateQuarter(turn.plan as Plan, turn.seed, data);
    return { lines, doNothingLines };
  }
  return picksLines(turn.plan as Q2Plan, turn.seed, data, {
    ...t,
    conditions: conditionsOf(turn.event, historyFor(data, t.quarter, t.year)),
  });
}

export interface PlayedQuarter {
  quarter: QuarterId;
  /** The plan's card from the quarter's outcome. */
  card: ReportCard;
}

/**
 * The recovery goal the quarter after the last one played earns, if any (section 2): the measure that
 * fell most, by more than 10%, and its fall in whole percent, rounded down. The fall is the plan's: the
 * result with every expected effect its anchor carries taken out, result − (anchor − 2193 as sold),
 * against 2193 as sold in 2194, and against the same quarter a year earlier, measured the same way, after.
 */
export function recoveryFor(
  played: readonly PlayedQuarter[],
  data: DeepReadonly<BookshopData>,
): { measure: MeasureId; drop: number } | undefined {
  const last = played.at(-1);
  if (!last) return undefined;
  const t = quarterParts(last.quarter);
  const netOf = (q: PlayedQuarter) => {
    const parts = quarterParts(q.quarter);
    const base = prepare(data, parts.quarter, parts.year).lastYear;
    return byMeasure((id) => {
      const m = q.card.measures.find((x) => x.id === id)!;
      return m.result - (m.lastYear - base[id]);
    });
  };
  const now = netOf(last);
  let before: Measures;
  if (t.year === YEAR) before = prepare(data, t.quarter, t.year).lastYear;
  else {
    const yearEarlier = quarterAt(quarterIndex(last.quarter) - 4);
    const earlier = played.find((q) => q.quarter === yearEarlier);
    if (!earlier) return undefined;
    before = netOf(earlier);
  }
  let best: { measure: MeasureId; fall: number } | undefined;
  for (const id of MEASURE_IDS) {
    if (before[id] <= 0) continue;
    const fall = 1 - now[id] / before[id];
    if (fall > RECOVERY_FALL && (!best || fall > best.fall)) best = { measure: id, fall };
  }
  return best && { measure: best.measure, drop: Math.floor(best.fall * 100) };
}
