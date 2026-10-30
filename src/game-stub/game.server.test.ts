import { afterEach, describe, expect, it } from "vitest";
import { getOutcome, resetStub, submitPlan } from "./game.server";

const request = new Request("http://localhost/decide");

describe("the game stub", () => {
  afterEach(resetStub);

  it("has no outcome until a plan is submitted", () => {
    expect(getOutcome(request)).toBeNull();
  });

  it("replays Q1 2193 for holding course, at 60% cost of goods", () => {
    submitPlan(request, { option: "A" });
    const outcome = getOutcome(request)!;
    expect(outcome.monthly.map((m) => m.month)).toEqual(["2194-01", "2194-02", "2194-03"]);
    expect(outcome.totals.holdCourse.revenue).toBeCloseTo(95245.8078, 2);
    // The design puts holding course at about $37.1k gross profit, after removing
    // 2193's Book of the Month effect, which the stub doesn't model.
    expect(Math.abs(outcome.totals.holdCourse.grossProfit - 37_100)).toBeLessThan(1000);
    expect(outcome.reportCard.plan).toEqual(outcome.reportCard.holdCourse);
    expect(outcome.reportCard.plan.measures[0]!.result).toBe(outcome.totals.plan.grossProfit);
  });

  it("marks the rules the plan used, and only those", () => {
    submitPlan(request, { option: "D" });
    const used = getOutcome(request)!.assumptions.filter((a) => a.usedByPlan).map((a) => a.id);
    expect(used).toEqual(["replay", "cost-of-goods", "event-orders", "event-cost"]);
  });

  it("gives a sale more revenue and less gross profit", () => {
    submitPlan(request, { option: "B" });
    const { totals, reportCard, happened, facts } = getOutcome(request)!;
    expect(totals.plan.revenue).toBeGreaterThan(totals.holdCourse.revenue);
    const [profit, readers] = reportCard.plan.measures;
    const [heldProfit, heldReaders] = reportCard.holdCourse.measures;
    expect(profit!.score).toBeLessThan(heldProfit!.score);
    expect(readers!.score).toBeGreaterThan(heldReaders!.score);
    expect(facts.option).toBe("B");
    expect(happened).toHaveLength(3);
  });
});
