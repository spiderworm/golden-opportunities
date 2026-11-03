import { describe, expect, it } from "vitest";
import tables from "~/bookshop/data.json";
import { joinBookshop } from "~/bookshop/joins";
import type { BookshopTables } from "~/bookshop/types";
import { goodPlan } from "./plans";
import { q2PlanProblem } from "./q2";
import { quarterAt } from "./quarters";
import { removedAt } from "./strikes";
import { simulateTurn } from "./turn";
import type { Q2Plan } from "./types";

const data = joinBookshop(tables as BookshopTables);
const QUIET = { type: "quiet_quarter", params: {}, stretch: null };

describe("a sensible player's plan (goodPlan)", () => {
  it("re-picks and runs author nights in Q1 2194, then picks three quiet hardcovers and runs author nights", () => {
    expect(goodPlan(1, "2194-Q1", data)).toEqual({ levers: ["repick", "events"] });
    for (let n = 1; n < 8; n++) {
      const plan = goodPlan(1, quarterAt(n), data) as Q2Plan;
      expect(q2PlanProblem(plan, data)).toBeNull();
      expect(plan.levers).toEqual(["events"]);
      expect(plan.picks.every((isbn) => isbn !== null)).toBe(true);
    }
  });

  it(
    "lasts five years on seed 1 with quiet quarters: the panel never removes it",
    { timeout: 60_000 },
    () => {
      const overall = Array.from({ length: 20 }, (_, n) => {
        const quarter = quarterAt(n);
        const turn = {
          quarter,
          seed: 1,
          plan: goodPlan(1, quarter, data),
          event: n < 2 ? null : QUIET,
        };
        return simulateTurn(turn, data).outcome.reportCard.plan.overall.score;
      });
      expect(removedAt(overall)).toBeNull();
      expect(Math.min(...overall.slice(0, 2))).toBeGreaterThanOrEqual(70);
    },
  );
});
