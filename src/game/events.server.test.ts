import { describe, expect, it } from "vitest";
import { loadBookshop } from "../bookshop/loader.server";
import { MAX_EVENTS, type ViewEvent } from "../query/events";
import { runQuery } from "../query/run-query.server";
import type { Query, QueryView } from "../query/types";
import { eventsForSave } from "./events.server";
import type { GameSave } from "./types";

const data = loadBookshop();
const ROMANCE = "989-28-229-1404-4"; // The Seawitch Sings, mass market paperback
const MEMOIR = "989-28-654-7965-4"; // We're Sisters and We Kinda Like Each Other, hardcover

/** A save as far as its events read it: each played quarter's plan. */
const saveWith = (...plans: { period: string; plan: unknown }[]) =>
  ({
    played: plans.map(({ period, plan }) => ({ period, outcome: { plan } })),
  }) as unknown as GameSave;
const q1 = (levers: string[]) => ({ period: "2194-Q1", plan: { levers } });
const q2 = (picks: (string | null)[], levers: string[]) => ({
  period: "2194-Q2",
  plan: { picks, levers },
});
const brief = (events: readonly { date: string; kind: string; label: string }[]) =>
  events.map((e) => `${e.date} ${e.kind}: ${e.label}`);

describe("a save's events (David, 3 Nov 2026)", () => {
  it("marks Q1's release, its scheduled picks and the player's move, in date order", () => {
    expect(brief(eventsForSave(saveWith(q1(["sale"])), data))).toEqual([
      "2194-01-01 move: Station-wide sale",
      "2194-01-01 pick: The Mallemaroking, mass market paperback",
      "2194-02-01 pick: Rystwyth, hardcover",
      "2194-02-04 release: The Bourton Model Village Poisoning, Inspector Ryeslton volume 3",
      "2194-03-01 pick: Portmeirion, mass market paperback",
    ]);
  });

  it("marks the re-picked titles instead, and gives holding course no marker", () => {
    const events = eventsForSave(saveWith(q1(["repick"])), data);
    expect(events.filter((e) => e.kind === "pick").map((e) => e.label)).toEqual([
      "Kalakalal Avenue, hardcover",
      "Can I Be Honest?, hardcover",
      "Who Did You Think You Were Kidding?, hardcover",
    ]);
    expect(events.filter((e) => e.kind === "move").map((e) => e.label)).toEqual([
      "Re-pick Book of the Month",
    ]);
    expect(eventsForSave(saveWith(q1([])), data).some((e) => e.kind === "move")).toBe(false);
  });

  it("marks a later quarter's picks as the player chose them, and its move", () => {
    const events = eventsForSave(saveWith(q1([]), q2([ROMANCE, null, MEMOIR], ["events"])), data);
    expect(brief(events.filter((e) => e.date >= "2194-04"))).toEqual([
      "2194-04-01 move: Weekday author nights",
      "2194-04-01 pick: The Seawitch Sings, mass market paperback",
      "2194-06-01 pick: We're Sisters and We Kinda Like Each Other, hardcover",
    ]);
  });

  it("never marks a quarter that hasn't been played, nor 2193 (its picks are discovery D's)", () => {
    expect(eventsForSave(saveWith(), data)).toEqual([]);
    const events = eventsForSave(saveWith(q1(["sale"])), data);
    expect(events.every((e) => e.date >= "2194-01-01" && e.date < "2194-04-01")).toBe(true);
  });
});

describe("the events a result marks", () => {
  const events = eventsForSave(
    saveWith(q1(["sale"]), q2([ROMANCE, null, MEMOIR], ["events"])),
    data,
  );
  const view: QueryView = {
    periods: ["2193-Q1", "2193-Q2", "2193-Q3", "2193-Q4", "2194-Q1", "2194-Q2"],
    includeUndated: false,
    events,
  };
  const marked = (query: Query, v: QueryView = view) =>
    runQuery(query, v, () => {}).events?.list.map((e) => `${e.kind}: ${e.label}`);

  it("marks every event on the whole shop over months or quarters, and none on any other breakdown", () => {
    expect(marked({ measure: "revenue", by: ["month"] })).toHaveLength(events.length);
    expect(marked({ measure: "units", by: ["quarter"] })).toHaveLength(events.length);
    expect(marked({ measure: "revenue", by: ["genre"] })).toBeUndefined();
    expect(marked({ measure: "revenue", by: ["month"] }, { ...view, events: undefined })).toEqual(
      [],
    );
  });

  it("marks an edition's event only where its sales are, and the shop's moves everywhere", () => {
    const romance = marked({ measure: "revenue", by: ["month"], filter: { genre: ["Romance"] } });
    expect(romance).toEqual([
      "move: Station-wide sale",
      "move: Weekday author nights",
      "pick: The Seawitch Sings, mass market paperback",
    ]);
    const mystery = marked({ measure: "revenue", by: ["month"], filter: { genre: ["Mystery"] } });
    expect(mystery).toContain(
      "release: The Bourton Model Village Poisoning, Inspector Ryeslton volume 3",
    );
    // A filter the edition doesn't answer, like the weekday, hides nothing.
    expect(
      marked({ measure: "revenue", by: ["month"], filter: { weekday: ["Monday"] } }),
    ).toHaveLength(events.length);
  });

  it("marks only the quarters and months the query covers", () => {
    expect(marked({ measure: "revenue", by: ["month"], filter: { quarter: ["2194-Q2"] } })).toEqual(
      [
        "move: Weekday author nights",
        "pick: The Seawitch Sings, mass market paperback",
        "pick: We're Sisters and We Kinda Like Each Other, hardcover",
      ],
    );
    // February: its pick and the release, and Q1's move, which is the whole quarter's.
    expect(marked({ measure: "revenue", by: ["quarter"], filter: { month: ["2194-02"] } })).toEqual(
      [
        "move: Station-wide sale",
        "pick: Rystwyth, hardcover",
        "release: The Bourton Model Village Poisoning, Inspector Ryeslton volume 3",
      ],
    );
    // 2193 has none.
    expect(marked({ measure: "revenue", by: ["month"], filter: { quarter: ["2193-Q4"] } })).toEqual(
      [],
    );
  });

  it("names the group an event marks beside time, and counts one whose group a limit cut (Audit, #353)", () => {
    const result = runQuery({ measure: "revenue", by: ["genre", "month"] }, view, () => {});
    const release = result.events!.list.find((e) => e.kind === "release");
    expect(release?.group).toEqual({ genre: "Mystery" });
    expect(result.events!.list.find((e) => e.kind === "move")?.group).toBeUndefined();
    // Cut to one row, every edition's event but that group's is hidden, and counted.
    const cut = runQuery({ measure: "revenue", by: ["genre", "month"], limit: 1 }, view, () => {});
    const editions = events.filter((e) => e.dimensions).length;
    const drawn = cut.events!.list.filter((e) => e.kind !== "move").length;
    expect(cut.events!.hidden).toBe(editions - drawn);
  });

  it("keeps the most relevant past the cap, and says how many it left out", () => {
    const many: ViewEvent[] = Array.from({ length: MAX_EVENTS + 5 }, (_, i) => ({
      date: `2194-0${1 + (i % 3)}-01`,
      precision: "month",
      kind: "pick",
      label: `Pick ${i}`,
    }));
    const result = runQuery(
      { measure: "revenue", by: ["month"] },
      { ...view, events: [...many, ...events] },
      () => {},
    );
    expect(result.events!.list).toHaveLength(MAX_EVENTS);
    expect(result.events!.hidden).toBe(many.length + events.length - MAX_EVENTS);
    expect(result.events!.list.some((e) => e.kind === "release")).toBe(true);
    expect(result.events!.list.filter((e) => e.kind === "move")).toHaveLength(2);
    // Never the edition's dimensions: only what the marker shows.
    expect(Object.keys(result.events!.list[0]!).sort()).toEqual([
      "date",
      "kind",
      "label",
      "precision",
    ]);
  });
});
