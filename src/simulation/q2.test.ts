import { describe, expect, it } from "vitest";
import tables from "~/bookshop/data.json";
import { joinBookshop } from "~/bookshop/joins";
import type { BookshopTables } from "~/bookshop/types";
import { OBSERVED_EXTRAS } from "./model";
import { isQ2Outcome } from "./outcome-check";
import { isQ2Plan } from "./plan";
import { RELEASE } from "./release";
import { q2Candidates, q2PlanProblem, simulateQ2 } from "./q2";
import type { Q2LeverId, Q2Plan } from "./types";

const data = joinBookshop(tables as BookshopTables);
const candidates = q2Candidates(data);
const isbn = (title: string, format: string) => candidates.find((c) => c.title === title && c.format === format)!.isbn;
const plan = (picks: (string | null)[], ...levers: Q2LeverId[]): Q2Plan => ({ picks, levers });
const HOLD = plan([null, null, null]);
// docs/design/q2.md section 8: three quiet, well-rated hardcovers, and three bestsellers.
const QUIET = [isbn("Land Water Sky Space", "Hardcover"), isbn("Thatchwork Cottage", "Hardcover"), isbn("Kalakalal Avenue", "Hardcover")];
const BESTSELLERS = [isbn("The Mallemaroking", "Mass market paperback"), isbn("Rystwyth", "Hardcover"), isbn("Portmeirion", "Mass market paperback")];
const PLANS = [HOLD, plan(QUIET), plan(BESTSELLERS), plan(QUIET, "events"), plan(QUIET, "sale"), plan([null, null, null], "events"), plan([QUIET[0], null, null])];
const SWEEP = { timeout: 60_000 };
const median = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b);
  return (s[Math.floor((s.length - 1) / 2)] + s[Math.ceil((s.length - 1) / 2)]) / 2;
};

describe("Q2 plans", () => {
  it("accepts an ISBN or null for each month, and at most one other move", () => {
    expect(isQ2Plan(HOLD)).toBe(true);
    expect(isQ2Plan(plan(QUIET, "events"))).toBe(true);
    expect(isQ2Plan(plan([null, QUIET[1], null], "sale"))).toBe(true);
    for (const bad of [
      { picks: [null, null], levers: [] },
      { picks: [QUIET[0], QUIET[0], null], levers: [] },
      { picks: [null, null, null], levers: ["events", "sale"] },
      { picks: [null, null, null], levers: ["repick"] },
      { picks: [null, null, null], levers: [], extra: 1 },
      { picks: [1, null, null], levers: [] },
      { picks: ["", null, null], levers: [] },
      { picks: [null, null, null] },
    ])
      expect(isQ2Plan(bad)).toBe(false);
  });

  it("offers every edition sold in 2193, and the new volume", () => {
    expect(candidates).toHaveLength(new Set(data.saleLines.map((l) => l.isbn)).size + 1);
    expect(candidates).toContainEqual({ isbn: RELEASE.edition.isbn, bookId: RELEASE.book.id, title: RELEASE.book.title, format: "Hardcover", listPrice: 22.99 });
    expect(candidates.map((c) => c.isbn)).toEqual([...new Set(candidates.map((c) => c.isbn))]);
  });

  it("features the edition picked, even beside another of the same title and format", () => {
    // Heliotrope Pajamas has two paperback editions, at $7.99 and $10.99.
    const [first, second] = candidates.filter((c) => c.title === "Heliotrope Pajamas" && c.format === "Paperback");
    expect(first.isbn).not.toBe(second.isbn);
    for (const chosen of [first, second]) {
      const { lines, outcome } = simulateQ2(plan([chosen.isbn, null, null]), 1, data);
      const april = lines.filter((l) => l.date.slice(5, 7) === "04" && l.discount === 0.15);
      expect(new Set(april.map((l) => l.isbn))).toEqual(new Set([chosen.isbn]));
      expect(outcome.facts.picks[0]).toMatchObject({ isbn: chosen.isbn, extra: expect.any(Number) });
    }
  });

  it("refuses an invalid plan, an unknown edition, and a title picked twice", () => {
    expect(() => simulateQ2({ picks: [null, null], levers: [] } as unknown as Q2Plan, 1, data)).toThrow(/Invalid Q2 plan/);
    expect(() => simulateQ2(plan(["000", null, null]), 1, data)).toThrow(/sold in 2193/);
    const twoFormats = candidates.find((c) => candidates.some((d) => d.bookId === c.bookId && d.isbn !== c.isbn))!;
    const other = candidates.find((d) => d.bookId === twoFormats.bookId && d.isbn !== twoFormats.isbn)!;
    expect(() => simulateQ2(plan([twoFormats.isbn, other.isbn, null]), 1, data)).toThrow(/same title/);
    // The same checks, without throwing, for the game to answer with a 400.
    expect(q2PlanProblem({ picks: [null, null], levers: [] }, data)).toBe("shape");
    expect(q2PlanProblem(plan(["000", null, null]), data)).toBe("unknown-edition");
    expect(q2PlanProblem(plan([twoFormats.isbn, other.isbn, null]), data)).toBe("same-title");
    expect(q2PlanProblem(plan(QUIET, "events"), data)).toBeNull();
  });
});

describe("Q2 simulation", SWEEP, () => {
  it("is deterministic, and gives every plan the same holding course", () => {
    const hold = simulateQ2(HOLD, 7, data);
    expect(hold.doNothingLines).toEqual(hold.lines);
    for (const p of PLANS) {
      const result = simulateQ2(p, 7, data);
      expect(result).toEqual(simulateQ2(p, 7, data));
      expect(result.doNothingLines).toEqual(hold.lines);
      expect(result.outcome.reportCard.holdCourse).toEqual(hold.outcome.reportCard.plan);
    }
    expect(simulateQ2(HOLD, 1, data).lines).not.toEqual(simulateQ2(HOLD, 2, data).lines);
  });

  it("writes Q2 lines at 2193's grain, with ids that never collide with Q1's", () => {
    const { lines, outcome } = simulateQ2(plan(QUIET, "events"), 3, data);
    expect(lines).toHaveLength(outcome.totals.plan.units);
    expect(lines.every((l) => l.date >= "2194-04-01" && l.date <= "2194-06-30" && l.quarter === 2)).toBe(true);
    expect(new Set(lines.map((l) => l.id)).size).toBe(lines.length);
    expect(lines[0]).toMatchObject({ id: "sim-2194-q2:1", orderId: "S2194Q2-000001", itemId: "I2194Q2-000001", sourceSheet: "simulation" });
  });

  it("holds course with the empty calendar: no Book of the Month discount", () => {
    expect(simulateQ2(HOLD, 1, data).lines.some((l) => l.discount === 0.15)).toBe(false);
  });

  it("features each pick for its own month only, with extra copies as in 2193", () => {
    const { lines, outcome } = simulateQ2(plan([QUIET[0], null, QUIET[2]]), 5, data);
    const featured = (isbn: string, month: string) => lines.filter((l) => l.isbn === isbn && l.date.slice(5, 7) === month);
    expect(featured(QUIET[0], "04").every((l) => l.discount === 0.15)).toBe(true);
    expect(featured(QUIET[0], "05").some((l) => l.discount === 0.15)).toBe(false);
    expect(lines.some((l) => l.date.slice(5, 7) === "05" && l.discount === 0.15)).toBe(false);
    const [april, may, june] = outcome.facts.picks;
    expect(may).toBeNull();
    for (const f of [april!, june!]) expect(OBSERVED_EXTRAS).toContain(f.extra);
    expect(april).toMatchObject({ isbn: QUIET[0], title: "Land Water Sky Space", format: "Hardcover" });
  });

  it("produces outcomes the game's check accepts, and that check refuses a tampered one", () => {
    for (const p of PLANS) expect(isQ2Outcome(simulateQ2(p, 2, data).outcome)).toBe(true);
    const outcome = simulateQ2(plan(QUIET, "events"), 2, data).outcome;
    const tamper = (change: (o: Record<string, any>) => void) => {
      const copy = structuredClone(outcome) as Record<string, any>;
      change(copy);
      return isQ2Outcome(copy);
    };
    expect(tamper((o) => (o.quarter = "2194-Q1"))).toBe(false);
    expect(tamper((o) => (o.monthly[0].month = "2194-01"))).toBe(false);
    expect(tamper((o) => (o.facts.picks[1] = null))).toBe(false);
    expect(tamper((o) => delete o.facts.events)).toBe(false);
    expect(tamper((o) => (o.reportCard.plan.overall.score = "untrusted"))).toBe(false);
    expect(tamper((o) => (o.plan.levers = ["events", "sale"]))).toBe(false);
  });
});

describe("Q2 copy", () => {
  it("says what happened, one move or two", () => {
    expect(simulateQ2(HOLD, 1, data).outcome.happened).toEqual(["You left the calendar empty: no Book of the Month in April, May or June."]);
    const picks = simulateQ2(plan(QUIET), 1, data).outcome.happened;
    expect(picks).toHaveLength(4);
    expect(picks[0]).toMatch(/^In April, Land Water Sky Space sold about \d+ extra copies; the discount on \d+ copies that would have sold anyway cost \$[\d,]+\.$/);
    expect(picks[3]).toMatch(/^Gross profit was [+-]\$[\d,]+ compared with holding course\.$/);
    const two = simulateQ2(plan(QUIET, "events"), 1, data).outcome.happened;
    expect(two.at(-1)).toMatch(/^Together, your two moves changed gross profit by/);
    expect(two.filter((s) => s.startsWith("Gross profit"))).toHaveLength(0);
  });

  it("states Q2's assumptions, the Book of the Month rules only for a plan with a pick", () => {
    const used = (p: Q2Plan) => Object.fromEntries(simulateQ2(p, 1, data).outcome.assumptions.map((a) => [a.id, a.usedByPlan]));
    const hold = simulateQ2(HOLD, 1, data).outcome.assumptions;
    expect(hold.find((a) => a.id === "replay")!.text).toMatch(/^Q2 2194 repeats Q2 2193/);
    expect(hold.find((a) => a.id === "event-orders")!.text).toMatch(/at Q2's average order value of \$\d+\.\d\d/);
    expect(used(HOLD)).toMatchObject({ replay: true, "cost-of-goods": true, "botm-price": false, "botm-extra": false, "no-cannibalization": false, "sale-response": false, "event-orders": false });
    expect(used(plan(QUIET, "sale"))).toMatchObject({ "botm-price": true, "botm-extra": true, "sale-response": true, "event-orders": false });
  });
});

describe("the new volume in Q2", SWEEP, () => {
  it("keeps selling about 4.5 copies a day at full price, with no launch", () => {
    const copies = Array.from({ length: 10 }, (_, i) => simulateQ2(HOLD, i + 1, data).lines.filter((l) => l.isbn === RELEASE.edition.isbn).length);
    for (const c of copies) {
      expect(c).toBeGreaterThan(390);
      expect(c).toBeLessThan(430);
    }
  });

  it("can be picked, and its copies that would sell anyway lose 15%", () => {
    const { outcome } = simulateQ2(plan([RELEASE.edition.isbn, null, null]), 1, data);
    expect(outcome.facts.picks[0]).toMatchObject({ isbn: RELEASE.edition.isbn, title: RELEASE.book.title, format: "Hardcover" });
    expect(outcome.facts.picks[0]!.baseCopies).toBeGreaterThan(100);
    expect(q2PlanProblem(plan([RELEASE.edition.isbn, null, null]), data)).toBeNull();
  });

  it("anchors each goal on Q2 2193 plus the volume's expected effect", () => {
    const card = simulateQ2(HOLD, 1, data).outcome.reportCard.plan.measures;
    const profit = card.find((m) => m.id === "profit")!;
    // q2.md section 8: Q2 2193's $65,119, plus about $3,773.
    expect(profit.lastYear).toBeCloseTo(68892.3926, 3);
    expect(profit.goal).toBeCloseTo(72337.0122, 3);
  });
});

// The bands in docs/design/q2.md section 8, with the new volume still selling and anchored.
describe("Q2 calibration", SWEEP, () => {
  const seeds = Array.from({ length: 20 }, (_, i) => i + 1);
  const scores = (p: Q2Plan) => seeds.map((s) => simulateQ2(p, s, data).outcome.reportCard.plan.overall.score);
  const profitChange = (p: Q2Plan) =>
    median(seeds.map((s) => simulateQ2(p, s, data).outcome.totals).map((t) => t.plan.grossProfit - t.holdCourse.grossProfit));

  it("scores each kind of plan in its band", () => {
    const hold = scores(HOLD);
    const quiet = scores(plan(QUIET));
    const sellers = scores(plan(BESTSELLERS));
    const quietNights = scores(plan(QUIET, "events"));
    const quietSale = scores(plan(QUIET, "sale"));
    expect(median(hold)).toBeGreaterThanOrEqual(64);
    expect(median(hold)).toBeLessThanOrEqual(67);
    expect(median(quiet)).toBeGreaterThanOrEqual(70);
    expect(Math.max(...quiet)).toBeLessThan(80);
    expect(median(sellers)).toBeLessThan(median(hold));
    expect(median(quietNights)).toBeGreaterThanOrEqual(78);
    expect(Math.max(...quietNights)).toBeLessThan(87);
    expect(Math.max(...quietSale)).toBeLessThan(40);
    // Volume 3 is the trap pick: in April, beside two quiet picks, it scores below three quiet picks.
    const trap = scores(plan([RELEASE.edition.isbn, QUIET[1], QUIET[2]]));
    expect(median(trap)).toBeLessThan(median(quiet) - 3);
  });

  it("makes quiet picks pay and bestseller picks lose money", () => {
    expect(profitChange(plan(QUIET))).toBeGreaterThan(1000);
    expect(profitChange(plan(BESTSELLERS))).toBeLessThan(-1000);
  });
});
