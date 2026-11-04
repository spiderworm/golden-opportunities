import { it, vi, expect } from "vitest";
import { writeFileSync } from "node:fs";
vi.mock("../platform/analytics/instance.server", () => ({ DATA_DIR: process.env.FIVE_YEAR_DIR!, instanceId: () => "five-year-validation" }));
vi.mock("../platform/analytics/analytics.server", () => ({ trackServer: vi.fn() }));
import { loadBookshop } from "../bookshop/loader.server";
import { goodPlan } from "../simulation/plans";
import { getQuarterBrief, submitPlan, submitQuarterPlan } from "./game.server";
import { currentQuarter } from "./progress";
import { saves, getGameSession } from "./session.server";
import { forgetReplays } from "./replay.server";
import { getResultData } from "./results.server";
import { runQuery } from "../query/run-query.server";

it("plays and validates 20 quarters with cold ledger replay", { timeout: 900_000 }, async () => {
 const data = loadBookshop();
 const save = saves.create();
 saves.update(save.id, save.revision, draft => { draft.seed = 1; });
 const req = new Request("http://localhost/decide", { method: "POST", headers: { origin: "http://localhost", cookie: "orbital_save=" + save.id } });
 const rows = [];
 for (let i = 0; i < 20; i++) {
  const quarter = currentQuarter(saves.read(save.id));
  expect(quarter, `removed after ${i} quarters`).not.toBeNull();
  if (i === 0) submitPlan(req, goodPlan(1, quarter!, data) as never);
  else { await getQuarterBrief(req); await submitQuarterPlan(req, goodPlan(1, quarter!, data), quarter!); }
  const after = saves.read(save.id);
  expect(after.played).toHaveLength(i + 1);
  const played = after.played[i]!;
  expect(played.period).toBe(quarter);
  forgetReplays();
  const view = getGameSession(req).queryView;
  const revenue = runQuery({ measure: "revenue", by: [], filter: { quarter: [quarter!] } }, view).total;
  const units = runQuery({ measure: "units", by: [], filter: { quarter: [quarter!] } }, view).total;
  expect(revenue).toBeCloseTo(played.outcome.totals.plan.revenue, 6);
  expect(units).toBe(played.outcome.totals.plan.units);
  const result = getResultData(req)!;
  expect(result.quarter).toBe(quarter);
  expect(result.record).toHaveLength(i + 1);
  expect(result.removed).toBeNull();
  rows.push({ quarter, revenue, units, score: played.outcome.reportCard.plan.overall.score, next: currentQuarter(after) });
  console.log("VALIDATED", JSON.stringify(rows.at(-1)));
 }
 expect(currentQuarter(saves.read(save.id))).toBe("2199-Q1");
 writeFileSync(process.env.FIVE_YEAR_DIR! + "/validation.json", JSON.stringify({ id: save.id, rows }, null, 2));
 console.log("FIVE_YEAR", save.id, rows.length);
});
