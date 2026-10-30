import { afterEach, describe, expect, it } from "vitest";
import { getOutcome, getPlan, resetStub, submitPlan } from "./game.server";

const request = new Request("http://localhost/decide");

describe("the game stub", () => {
  afterEach(resetStub);

  it("has no plan or outcome until a plan is submitted", () => {
    expect(getPlan(request)).toBeNull();
    expect(getOutcome(request)).toBeNull();
  });

  it("plays the plan through Sim's engine and keeps it", () => {
    submitPlan(request, { levers: ["repick", "events"] });
    expect(getPlan(request)).toEqual({ levers: ["repick", "events"] });
    const outcome = getOutcome(request)!;
    expect(outcome.plan).toEqual({ levers: ["repick", "events"] });
    expect(outcome.reportCard.plan.measures).toHaveLength(4);
    expect(outcome.discoveries).toEqual([]);
  });

  it("refuses a plan the engine doesn't accept", () => {
    expect(() => submitPlan(request, { levers: ["sale", "repick"] })).toThrow();
    expect(getPlan(request)).toBeNull();
  });
});
