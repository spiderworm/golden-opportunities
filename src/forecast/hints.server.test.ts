// The hints beside Decide's forecast inputs: played data only, as Investigate shows it.
import { afterAll, describe, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
const directory = await vi.hoisted(async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  return mkdtempSync(tmpdir() + "/orbital-hints-");
});
vi.mock("../platform/analytics/instance.server", () => ({
  DATA_DIR: directory,
  instanceId: () => "0123abcd-0000-4000-8000-000000000000",
}));
vi.mock("../platform/analytics/analytics.server", () => ({ trackServer: vi.fn() }));
import { getGameSession, saves } from "../game/session.server";
import { getOutcome, submitPlan } from "../game/game.server";
import { runQuery } from "../query/run-query.server";
import { trackServer } from "../platform/analytics/analytics.server";
import { forecastHints, hintsFor } from "./forecast.server";

afterAll(() => rmSync(directory, { recursive: true, force: true }));

const request = (id: string) =>
  new Request("http://localhost/decide", {
    method: "POST",
    headers: { origin: "http://localhost", cookie: "orbital_save=" + id },
  });
const total = (id: string, measure: string, quarter: string) =>
  runQuery(
    { measure, by: [], filter: { quarter: [quarter] } },
    getGameSession(request(id)).queryView,
  ).total;

describe("forecastHints", () => {
  it("gives Q1 2194 the quarter before and a year earlier, from 2193's ledgers", () => {
    const save = saves.create();
    vi.mocked(trackServer).mockClear();
    const hints = forecastHints(request(save.id))!;
    // Not the player's own lookups: no query events.
    expect(vi.mocked(trackServer)).not.toHaveBeenCalled();
    expect(hints.quarter).toBe("2194-Q1");
    for (const measure of ["revenue", "units"] as const) {
      expect(hints[measure].previous).toEqual({
        quarter: "2193-Q4",
        value: total(save.id, measure, "2193-Q4"),
      });
      expect(hints[measure].yearEarlier).toEqual({
        quarter: "2193-Q1",
        value: total(save.id, measure, "2193-Q1"),
      });
      expect(hints[measure].previous.value).toBeGreaterThan(0);
    }
  });

  it("gives Q2 the quarter just played, as its result has it", () => {
    const save = saves.create();
    submitPlan(request(save.id), { levers: ["sale"] });
    const outcome = getOutcome(request(save.id))!;
    const hints = forecastHints(request(save.id))!;
    expect(hints.quarter).toBe("2194-Q2");
    expect(hints.revenue.previous.quarter).toBe("2194-Q1");
    expect(hints.revenue.previous.value).toBeCloseTo(outcome.totals.plan.revenue, 6);
    expect(hints.units.previous.value).toBe(outcome.totals.plan.units);
    expect(hints.units.yearEarlier.quarter).toBe("2193-Q2");
  });

  it("says a quarter isn't in the ledgers rather than guessing", () => {
    const save = saves.create();
    const view = getGameSession(request(save.id)).queryView;
    // Ledgers that start at 2193-Q4: a year before Q1 2194 isn't there, and neither is a quarter not yet played.
    const trimmed = { ...view, periods: view.periods.filter((p) => p >= "2193-Q4") };
    const hints = hintsFor(trimmed, "2194-Q1");
    expect(hints.revenue.yearEarlier).toEqual({ quarter: "2193-Q1", value: null });
    expect(hints.units.yearEarlier).toEqual({ quarter: "2193-Q1", value: null });
    expect(hints.revenue.previous.value).toBeGreaterThan(0);
    expect(hintsFor(view, "2194-Q3").revenue.previous).toEqual({ quarter: "2194-Q2", value: null });
  });
});
