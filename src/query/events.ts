// Events on a time series (David, 3 Nov 2026: "mark the new volume's release (Feb 4), each Book of the Month pick,
// the player's Q1 move, and later Alma's events"). The server builds a save's list (src/game/events.server.ts),
// carries it in the trusted view, and a result over months or quarters gets the ones in its scope. Shared by the
// server and the browser, so it imports nothing but types.
import type { Dimension } from "./types";

export const EVENT_KINDS = ["release", "pick", "move", "event"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

/** One marker: when, how precisely, what kind, and what happened (Plot's copy: the tooltip's second line). */
export interface ChartEvent {
  /** The day it happened, or the first day of its month or quarter. */
  date: string;
  /** A release is a day; a pick, a month; a move, its whole quarter. */
  precision: "day" | "month" | "quarter";
  kind: EventKind;
  label: string;
  /**
   * With a book or edition dimension in the breakdown beside time, the group the event belongs to, by that
   * dimension (Audit, #353): the line it marks, e.g. `{ genre: "Mystery" }`.
   */
  group?: Partial<Record<Dimension, string>>;
}

/**
 * An event as the view carries it: with the dimensions of the edition it's about, when it's about one, so a query
 * shows it only where that edition's sales would be (relevance, run-query.server.ts). Never sent to the browser.
 */
export interface ViewEvent extends ChartEvent {
  dimensions?: Partial<Record<Dimension, string | null>>;
  /** The book's award names, for the award filter. */
  awards?: readonly string[];
}

/** Which kinds come first: a release, then a station event, the player's moves, picks (keeping and same-day order). */
export const EVENT_RANK: Record<EventKind, number> = { release: 0, event: 1, move: 2, pick: 3 };
/** Date order, and on one day, rank order. */
export const byDate = (a: ChartEvent, b: ChartEvent) =>
  a.date.localeCompare(b.date) || EVENT_RANK[a.kind] - EVENT_RANK[b.kind];

/** Most markers one result carries; past it, the least relevant are left out and counted (`hidden`). */
export const MAX_EVENTS = 60;
/** Most events a view may carry: five years of picks and moves is about 100. */
export const MAX_VIEW_EVENTS = 2000;

/** The quarter ("2194-Q1") a date ("2194-02-04") is in. */
export const quarterOfDate = (date: string) =>
  `${date.slice(0, 4)}-Q${Math.ceil(Number(date.slice(5, 7)) / 3)}`;
