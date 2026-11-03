import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import tables from "~/bookshop/data.json";
import { joinBookshop } from "~/bookshop/joins";
import type { BookshopTables } from "~/bookshop/types";
import { quarterDays, replayedDay } from "./model";
import { q2Candidates } from "./q2";
import { prepare } from "./simulate";
import { EVENT_TYPES } from "~/alma/events";
import { AGAINST } from "./conditions";
import { isQ2Outcome } from "./outcome-check";
import {
  anchorFor,
  endlessCertificates,
  ENGINE_VERSION,
  eventProblem,
  goalsFor,
  linesOfTurn,
  recoveryFor,
  removedAt,
  simulateTurn,
  strikes,
  type Turn,
  type TurnEvent,
} from "./turn";
import type { QuarterId } from "./quarters";
import type { Plan, Q2Plan, Q2SimulationResult, ReportCard } from "./types";
import { drawCandidates } from "~/alma/candidates";
import { STRETCH_PERCENT } from "~/alma/events";

const data = joinBookshop(tables as BookshopTables);
const candidates = q2Candidates(data);
const isbn = (title: string, format: string) =>
  candidates.find((c) => c.title === title && c.format === format)!.isbn;
const HOLD: Q2Plan = { picks: [null, null, null], levers: [] };
const NIGHTS: Q2Plan = { picks: [null, null, null], levers: ["events"] };
const SALE: Q2Plan = { picks: [null, null, null], levers: ["sale"] };
const event = (
  type: string,
  params: TurnEvent["params"] = {},
  stretch: TurnEvent["stretch"] = null,
  drop?: number,
): TurnEvent => (drop === undefined ? { type, params, stretch } : { type, params, stretch, drop });
const QUIET = event("quiet_quarter");
const turn = (
  quarter: QuarterId,
  plan: Plan | Q2Plan,
  ev: TurnEvent | null = QUIET,
  seed = 1,
): Turn => ({ quarter, seed, plan, event: ev });
const played = (t: Turn) => simulateTurn(t, data) as Q2SimulationResult;
const card = (t: Turn): ReportCard => simulateTurn(t, data).outcome.reportCard.plan;
const measure = (c: ReportCard, id: string) => c.measures.find((m) => m.id === id)!;

describe("2194 doesn't move (ENGINE_VERSION 1)", () => {
  it("plays Q1 and Q2 2194 with their own engines, byte for byte", { timeout: 60_000 }, () => {
    expect(ENGINE_VERSION).toBe(1);
    // Q1's is model.test.ts's fingerprint, d980df65… since #175.
    const q1 = createHash("sha256");
    const plans = [
      [],
      ["repick"],
      ["events"],
      ["sale"],
      ["repick", "events"],
      ["repick", "sale"],
      ["events", "sale"],
    ];
    for (const levers of plans)
      for (const seed of [1, 2, 3])
        q1.update(
          JSON.stringify(simulateTurn(turn("2194-Q1", { levers } as Plan, null, seed), data)),
        );
    expect(q1.digest("hex")).toBe(
      "d980df65fe0b055e42d7c1863c078e7fcfa60530aaed513719b579b48b76ee7e",
    );
    const quiet = [
      isbn("Land Water Sky Space", "Hardcover"),
      isbn("Thatchwork Cottage", "Hardcover"),
      isbn("Kalakalal Avenue", "Hardcover"),
    ];
    const best = [
      isbn("The Mallemaroking", "Mass market paperback"),
      isbn("Rystwyth", "Hardcover"),
      isbn("Portmeirion", "Mass market paperback"),
    ];
    const q2 = createHash("sha256");
    for (const plan of [
      HOLD,
      { picks: quiet, levers: [] },
      { picks: best, levers: [] },
      { picks: quiet, levers: ["events"] },
      { picks: quiet, levers: ["sale"] },
      NIGHTS,
    ] as Q2Plan[])
      for (const seed of [1, 2, 3])
        q2.update(JSON.stringify(simulateTurn(turn("2194-Q2", plan, null, seed), data)));
    expect(q2.digest("hex")).toBe(
      "5bfcabc64d2310fba336e86f5de1e3e83b4057a9fab17ddd0bf46f052451d569",
    );
  });

  it("takes no event in Q1 and Q2 2194, and no quarter before them", () => {
    expect(() => simulateTurn(turn("2194-Q2", HOLD, QUIET), data)).toThrow(/no event/);
    expect(() => simulateTurn(turn("2193-Q4" as QuarterId, HOLD), data)).toThrow(/playable/);
    expect(() => simulateTurn(turn("2195-Q5" as QuarterId, HOLD), data)).toThrow(/playable/);
  });
});

describe("later quarters", () => {
  it("replay 2193's same weekday nearest the same date, within the month, every year", () => {
    for (const year of [2195, 2196, 2197, 2198, 2199])
      for (const q of [1, 2, 3, 4] as const)
        for (const day of quarterDays(year, q)) {
          const back = replayedDay(day);
          expect(back.slice(0, 7)).toBe(`2193-${day.slice(5, 7)}`);
          expect(new Date(`${back}T00:00:00Z`).getUTCDay()).toBe(
            new Date(`${day}T00:00:00Z`).getUTCDay(),
          );
          expect(Math.abs(Number(back.slice(8)) - Number(day.slice(8)))).toBeLessThanOrEqual(7);
        }
  });

  it("are dated in their own year, from their own draws", () => {
    const q3 = played(turn("2194-Q3", HOLD));
    const later = played(turn("2195-Q3", HOLD));
    expect(q3.lines.every((l) => l.date >= "2194-07-01" && l.date < "2194-10-01")).toBe(true);
    expect(later.lines.every((l) => l.date >= "2195-07-01" && l.date < "2195-10-01")).toBe(true);
    expect(later.outcome.quarter).toBe("2195-Q3");
    expect(later.lines.length).not.toBe(q3.lines.length);
    expect(Math.abs(later.lines.length / q3.lines.length - 1)).toBeLessThan(0.05);
    // The new volume sells from January 1 after 2194, with no launch weeks.
    const jan = played(turn("2195-Q1", HOLD)).lines.filter(
      (l) => l.title === "The Bourton Model Village Poisoning",
    );
    expect(jan.some((l) => l.date < "2195-01-08")).toBe(true);
  });

  it("hold course scores as calibrated: about 64 in Q3 and 62 in Q4, a strike", () => {
    expect(measure(card(turn("2194-Q3", HOLD)), "profit").score).toBeLessThan(70);
    for (const [quarter, low, high] of [
      ["2194-Q3", 60, 67],
      ["2194-Q4", 58, 64],
      ["2195-Q1", 64, 72],
    ] as [QuarterId, number, number][]) {
      const overall = card(turn(quarter, HOLD)).overall.score;
      expect(overall).toBeGreaterThanOrEqual(low);
      expect(overall).toBeLessThanOrEqual(high);
    }
  });

  it(
    "keeps section 8's bands on seeds 1 to 20: Q3 and Q4 are the hard quarters",
    { timeout: 60_000 },
    () => {
      const band = (quarter: QuarterId, plan: Q2Plan) =>
        Array.from({ length: 20 }, (_, i) => card(turn(quarter, plan, QUIET, i + 1)).overall.score);
      const within = (scores: number[], low: number, high: number) => {
        expect(Math.min(...scores)).toBeGreaterThanOrEqual(low);
        expect(Math.max(...scores)).toBeLessThanOrEqual(high);
      };
      within(band("2194-Q3", HOLD), 62, 66);
      within(band("2194-Q3", NIGHTS), 68, 70);
      within(band("2194-Q4", HOLD), 61, 63);
      within(band("2194-Q4", NIGHTS), 65, 69);
    },
  );

  it("gives the same lines through linesOfTurn as through simulateTurn", () => {
    for (const t of [
      turn("2194-Q1", { levers: ["repick"] }, null),
      turn("2194-Q2", NIGHTS, null),
      turn("2194-Q4", NIGHTS, event("genre_slump", { genre: "Mystery", month: 2, percent: 20 })),
    ]) {
      const { lines, doNothingLines } = simulateTurn(t, data);
      expect(linesOfTurn(t, data)).toEqual({ lines, doNothingLines });
    }
  });

  it("loads a five-year save's lines in about a second", { timeout: 60_000 }, () => {
    const turns = Array.from({ length: 20 }, (_, n) => {
      const year = 2194 + Math.floor(n / 4);
      const q = (n % 4) + 1;
      const plan: Plan | Q2Plan = n === 0 ? { levers: ["repick", "events"] } : NIGHTS;
      return turn(`${year}-Q${q}` as QuarterId, plan, n < 2 ? null : QUIET, 7);
    });
    // Warm the shared history and join shares, as the server's first load after the data does.
    linesOfTurn(turns[0], data);
    const start = performance.now();
    for (const t of turns) linesOfTurn(t, data);
    const ms = performance.now() - start;
    console.log(`20 quarters of lines: ${Math.round(ms)} ms`);
    expect(ms).toBeLessThan(4_000);
  });
});

describe("Alma's events, as conditions", () => {
  it("moves one genre's orders in one month, and holding course's anchor with it", () => {
    const surge = event("genre_surge", { genre: "Mystery", month: 2, percent: 30 });
    const count = (r: Q2SimulationResult) =>
      new Set(
        r.doNothingLines
          .filter((l) => l.date.slice(5, 7) === "08" && l.genre === "Mystery")
          .map((l) => l.orderId),
      ).size;
    const ratio =
      count(played(turn("2194-Q3", HOLD, surge))) / count(played(turn("2194-Q3", HOLD)));
    expect(ratio).toBeGreaterThan(1.2);
    expect(ratio).toBeLessThan(1.4);
    expect(anchorFor("2194-Q3", surge, data).effect.readers).toBeGreaterThan(0);
  });

  it("takes orders off one weekday all quarter", () => {
    const quiet = event("quiet_days", { weekday: "Tuesday", percent: 25 });
    const tuesdays = (r: Q2SimulationResult) =>
      new Set(
        r.doNothingLines
          .filter((l) => new Date(`${l.date}T00:00:00Z`).getUTCDay() === 2)
          .map((l) => l.orderId),
      ).size;
    const ratio =
      tuesdays(played(turn("2194-Q4", HOLD, quiet))) / tuesdays(played(turn("2194-Q4", HOLD)));
    expect(ratio).toBeGreaterThan(0.7);
    expect(ratio).toBeLessThan(0.8);
  });

  it("names the event's genre as the memo does", () => {
    const text = played(
      turn(
        "2194-Q3",
        HOLD,
        event("genre_surge", { genre: "SciFi/Fantasy", month: 2, percent: 20 }),
      ),
    ).outcome.assumptions.find((a) => a.id === "event")!.text;
    expect(text).toMatch(
      /^Science fiction and fantasy orders in August are 20% higher than the replay/,
    );
  });

  it("charges an event's fare and format cost", () => {
    const fares = played(turn("2194-Q3", NIGHTS, event("author_fares", { cost: 350 })));
    expect(fares.outcome.totals.plan.eventCosts).toBe(12 * 350);
    expect(fares.outcome.assumptions.find((a) => a.id === "event-cost")!.text).toBe(
      "Each author night costs $350.",
    );
    const plain = played(turn("2194-Q3", HOLD)).outcome.totals.holdCourse;
    const dearer = played(
      turn("2194-Q3", HOLD, event("format_costs", { format: "Hardcover", percent: 70 })),
    );
    expect(dearer.outcome.totals.holdCourse.costOfGoods!).toBeGreaterThan(
      plain.costOfGoods! * 1.05,
    );
    expect(dearer.outcome.assumptions.find((a) => a.id === "event")!.text).toMatch(
      /^Hardcover copies cost the store 70% of their list price, instead of 60%/,
    );
  });

  it("anchors every event, so holding course scores the same with it as without, within noise", () => {
    const events = [
      event("genre_slump", { genre: "Fiction", month: 1, percent: 25 }),
      event("quiet_days", { weekday: "Saturday", percent: 25 }),
      event("format_costs", { format: "Hardcover", percent: 70 }),
    ];
    for (const seed of [1, 2, 3]) {
      const without = card(turn("2194-Q3", HOLD, QUIET, seed)).overall.score;
      for (const ev of events)
        expect(
          Math.abs(card(turn("2194-Q3", HOLD, ev, seed)).overall.score - without),
        ).toBeLessThanOrEqual(3);
    }
  });

  it("keeps the tier-1 extremes within the 10% bound, except hardcover costs at 70%", () => {
    // Hardcovers at 70% of list take 10.1% to 11.0% off holding course's profit in Q1, Q3 and Q4: past the bound.
    expect(
      eventProblem(event("format_costs", { format: "Hardcover", percent: 70 }), "2194-Q3", data),
    ).toBe("bound");
    for (const ev of [
      event("format_costs", { format: "Hardcover", percent: 69 }),
      event("quiet_days", { weekday: "Saturday", percent: 25 }),
      event("genre_surge", { genre: "Fiction", month: 2, percent: 30 }),
    ])
      expect(eventProblem(ev, "2194-Q3", data)).toBeNull();
    expect(
      eventProblem(event("format_costs", { format: "Hardcover", percent: 85 }), "2194-Q3", data),
    ).toBe("bound");
  });
});

describe("goals", () => {
  const anchor = { profit: 100_000, readers: 20_000, happiness: 65, culture: 27_000 };
  const average = prepare(data, 3).quarterlyAverage;

  it("stretch one measure by the event's percent", () => {
    expect(
      goalsFor(anchor, average, event("quiet_quarter", {}, { measure: "readers", percent: 15 })),
    ).toEqual({ readers: 23_000 });
    expect(goalsFor(anchor, average, QUIET)).toEqual({});
  });

  it("take the recovery cap from Alma's candidates, the largest extra stretch (Frank's review of #201)", () => {
    const candidates = drawCandidates(7, {
      quarter: "2194-Q3",
      previous: [],
      strikes: 0,
      recovery: { measure: "profit", drop: 35 },
    });
    for (const c of candidates)
      expect(c.stretch).toEqual({ measure: "profit", percent: STRETCH_PERCENT.max });
    expect(STRETCH_PERCENT.max).toBe(20);
    const goal = goalsFor(anchor, average, { ...candidates[0], drop: 35 }).profit;
    expect(goal).toBeCloseTo(anchor.profit * 1.2, 6);
  });

  it("set a recovery goal at the drop, never below the usual goal and never past the cap", () => {
    const recovery = (drop: number) =>
      goalsFor(
        anchor,
        average,
        event("quiet_quarter", {}, { measure: "profit", percent: 20 }, drop),
      ).profit;
    expect(recovery(14)).toBeCloseTo(114_000, 6);
    expect(recovery(35)).toBeCloseTo(120_000, 6);
    expect(recovery(3)).toBeCloseTo(105_000, 6);
  });

  it("score a stretched measure against its goal, with the anchor still at 70", () => {
    const stretched = card(
      turn("2194-Q3", NIGHTS, event("quiet_quarter", {}, { measure: "profit", percent: 20 })),
    );
    const plain = card(turn("2194-Q3", NIGHTS));
    expect(measure(stretched, "profit").goal).toBeCloseTo(
      measure(plain, "profit").lastYear * 1.2,
      6,
    );
    expect(measure(stretched, "profit").lastYear).toBe(measure(plain, "profit").lastYear);
  });
});

describe("strikes and removal (section 7)", () => {
  it("count a strike in its own quarter and the three after", () => {
    expect(strikes([60, 80, 80, 80], "removal")).toBe(1);
    expect(strikes([60, 80, 80, 80], "next")).toBe(0);
    expect(strikes([80, 60, 80, 80], "next")).toBe(1);
    expect(strikes([67, 66], "removal")).toBe(2);
  });

  it("remove at the third strike while two count, never before Q3", () => {
    expect(removedAt([67, 66, 64])).toBe(2);
    expect(removedAt([70, 66, 64, 62])).toBe(3);
    expect(removedAt([60, 80, 80, 60, 60])).toBeNull();
    // At the fifth quarter the first strike no longer counts.
    expect(removedAt([60, 80, 60, 80, 60])).toBeNull();
    expect(removedAt([80, 60, 80, 60, 60])).toBe(4);
    expect(removedAt([65, 65])).toBeNull();
  });
});

describe("recovery goals (section 2)", () => {
  const playedCard = (t: Turn) => ({ quarter: t.quarter, card: card(t) });

  it("follow a plan's fall, not an event's", () => {
    const q1 = playedCard(turn("2194-Q1", { levers: [] }, null));
    const q2 = playedCard(turn("2194-Q2", HOLD, null));
    expect(recoveryFor([q1, q2], data)).toBeUndefined();
    // The sale costs Q3 about a fifth of its profit against 2193 as sold.
    const sale = playedCard(turn("2194-Q3", SALE));
    expect(recoveryFor([q1, q2, sale], data)).toEqual({
      measure: "profit",
      drop: expect.any(Number),
    });
    expect(recoveryFor([q1, q2, sale], data)!.drop).toBeGreaterThan(10);
    // Format costs take up to 9.8% off holding course's profit; net of the event's expected effect, there's no fall.
    const dearer = playedCard(
      turn("2194-Q3", HOLD, event("format_costs", { format: "Hardcover", percent: 70 })),
    );
    expect(recoveryFor([q1, q2, dearer], data)).toBeUndefined();
  });

  it("compare a later year with the player's own quarter a year earlier", () => {
    const sale = playedCard(turn("2194-Q3", SALE));
    const again = playedCard(turn("2195-Q3", SALE));
    const better = playedCard(turn("2195-Q3", NIGHTS));
    expect(recoveryFor([sale, again], data)).toBeUndefined();
    expect(recoveryFor([playedCard(turn("2194-Q3", NIGHTS)), again], data)).toMatchObject({
      measure: "profit",
    });
    // From the sale's 81 to author nights' 66 is a real fall in Happiness: the plan's, so it earns a recovery goal.
    expect(recoveryFor([sale, better], data)).toMatchObject({ measure: "happiness" });
    expect(recoveryFor([again], data)).toBeUndefined();
  });
});

describe("Comeback and Weathered the Storm (endless-copy.md)", () => {
  const cardWith = (met: Partial<Record<string, boolean>>): ReportCard =>
    ({
      measures: ["profit", "readers", "happiness", "culture"].map((id) => ({
        id,
        met: met[id] ?? false,
      })),
      certificates: [],
    }) as unknown as ReportCard;
  const at = (ev: TurnEvent, plan: Q2Plan = NIGHTS): Turn => turn("2195-Q1", plan, ev);

  it("use the same table of measures each event works against as Alma's choosing rules", () => {
    expect(Object.fromEntries(EVENT_TYPES.map((t) => [t.id, [...t.against]]))).toEqual(AGAINST);
  });

  it("award Comeback for a met recovery goal, naming the quarter it fell in", () => {
    const recovery = event(
      "genre_surge",
      { genre: "Mystery", month: 1, percent: 20 },
      { measure: "readers", percent: 20 },
      14,
    );
    expect(endlessCertificates(cardWith({ readers: true }), at(recovery), true)).toEqual([
      { id: "comeback", measure: "readers", previous: "2194-Q4" },
    ]);
    expect(endlessCertificates(cardWith({ profit: true }), at(recovery), true)).toEqual([]);
    // An extra stretch met is no comeback.
    expect(
      endlessCertificates(
        cardWith({ readers: true }),
        at({ ...recovery, drop: undefined } as TurnEvent),
        true,
      ),
    ).toEqual([]);
  });

  it("award Weathered the Storm when every measure the event works against met its goal", () => {
    const slump = event("genre_slump", { genre: "Fiction", month: 2, percent: 20 });
    expect(
      endlessCertificates(
        cardWith({ profit: true, readers: true, culture: true }),
        at(slump),
        false,
      ),
    ).toEqual([
      {
        id: "weathered",
        measures: ["profit", "readers", "culture"],
        event: { type: "genre_slump", params: { genre: "Fiction", month: 2, percent: 20 } },
      },
    ]);
    expect(
      endlessCertificates(cardWith({ profit: true, readers: true }), at(slump), false),
    ).toEqual([]);
    // A surge and a quiet quarter work against nothing, so they're never a storm.
    for (const calm of [event("genre_surge", { genre: "Fiction", month: 2, percent: 20 }), QUIET])
      expect(
        endlessCertificates(
          cardWith({ profit: true, readers: true, happiness: true, culture: true }),
          at(calm),
          true,
        ),
      ).toEqual([]);
  });

  it("count author fares as a storm only above the usual $200, for a plan that ran author nights", () => {
    const fares = event("author_fares", { cost: 350 });
    expect(endlessCertificates(cardWith({ profit: true }), at(fares), true)).toMatchObject([
      { id: "weathered", measures: ["profit"] },
    ]);
    expect(endlessCertificates(cardWith({ profit: true }), at(fares, HOLD), false)).toEqual([]);
    expect(
      endlessCertificates(
        cardWith({ profit: true }),
        at(event("author_fares", { cost: 200 })),
        true,
      ),
    ).toEqual([]);
    // Cheaper nights help: quiet picks and author nights at $100 meet Profit's goal, and that's no storm.
    const quiet = [
      isbn("Kalakalal Avenue", "Hardcover"),
      isbn("Can I Be Honest?", "Hardcover"),
      isbn("Who Did You Think You Were Kidding?", "Hardcover"),
    ];
    const cheap = card(
      turn("2195-Q1", { picks: quiet, levers: ["events"] }, event("author_fares", { cost: 100 })),
    );
    expect(measure(cheap, "profit").met).toBe(true);
    expect(cheap.certificates.some((c) => c.id === "weathered")).toBe(false);
  });

  it("appear on played quarters exactly when earned", { timeout: 60_000 }, () => {
    const storms = [
      event("quiet_days", { weekday: "Saturday", percent: 20 }),
      event("format_costs", { format: "Hardcover", percent: 69 }),
      event("author_fares", { cost: 250 }),
    ];
    for (const ev of storms)
      for (const seed of [1, 2, 3]) {
        const { outcome } = played(turn("2195-Q1", NIGHTS, ev, seed));
        const card = outcome.reportCard.plan;
        const met = AGAINST[ev.type].every((id) => card.measures.find((m) => m.id === id)!.met);
        expect(card.certificates.some((c) => c.id === "weathered")).toBe(met);
      }
  });

  it("are checked field by field when a save is read", () => {
    // Q2's outcome, which the check reads today, carrying the later quarters' certificates.
    const { outcome } = played(turn("2194-Q2", NIGHTS, null));
    const withCertificate = (c: unknown) => ({
      ...outcome,
      reportCard: {
        ...outcome.reportCard,
        plan: { ...outcome.reportCard.plan, certificates: [c] },
      },
    });
    expect(
      isQ2Outcome(withCertificate({ id: "comeback", measure: "profit", previous: "2194-Q4" })),
    ).toBe(true);
    expect(
      isQ2Outcome(
        withCertificate({
          id: "weathered",
          measures: ["profit"],
          event: { type: "author_fares", params: { cost: 150 } },
        }),
      ),
    ).toBe(true);
    expect(
      isQ2Outcome(withCertificate({ id: "comeback", measure: "profit", previous: "last spring" })),
    ).toBe(false);
    expect(isQ2Outcome(withCertificate({ id: "weathered", measures: ["profit", "profit"] }))).toBe(
      false,
    );
    expect(isQ2Outcome(withCertificate({ id: "weathered", note: "extra" }))).toBe(false);
  });
});
