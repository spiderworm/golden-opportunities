import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

const directory = await vi.hoisted(async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  return mkdtempSync(tmpdir() + "/orbital-reports-");
});
vi.mock("~/platform/analytics/instance.server", () => ({ DATA_DIR: directory }));
vi.mock("~/platform/analytics/analytics.server", () => ({ trackServer: vi.fn() }));
import { submitPlan } from "~/game/game.server";
import { saves } from "~/game/session.server";
import { getStationState } from "~/shell/station-state";
import { greeting } from "./copy";
import Reports, { action, loader } from "./route";
import type { Route } from "./+types/route";
afterAll(() => rmSync(directory, { recursive: true, force: true }));

function requestFor(id: string, method = "GET") {
  return new Request("http://localhost/reports", {
    method,
    headers: { origin: "http://localhost", cookie: "orbital_save=" + id },
  });
}

function render(loaderData: Awaited<ReturnType<typeof loader>>) {
  const Stub = createRoutesStub([
    {
      path: "/reports",
      Component: () => <Reports {...({ loaderData } as unknown as Route.ComponentProps)} />,
    },
  ]);
  return renderToString(<Stub initialEntries={["/reports"]} />);
}

describe("Reports", () => {
  it("greets with the new reports, one, many or none", () => {
    expect(greeting(0)).toBe("No new reports.");
    expect(greeting(1)).toBe("You have 1 new report.");
    expect(greeting(3)).toBe("You have 3 new reports.");
  });

  it("says no quarter is filed before Q1 closes, and counts none new", () => {
    const save = saves.create();
    const data = loader({ request: requestFor(save.id) } as Route.LoaderArgs);
    expect(data).toEqual({ reports: [], record: [], removedAt: null });
    expect(getStationState(requestFor(save.id)).newReports).toBe(0);
    const html = render(data);
    expect(html).toContain("No new reports.");
    expect(html).toContain("No quarter has been filed yet.");
  });

  it("builds each played quarter's report from the save, new until seen, and sends nothing of the save", () => {
    const save = saves.create();
    submitPlan(requestFor(save.id, "POST"), { levers: ["events"] });
    const data = loader({ request: requestFor(save.id) } as Route.LoaderArgs);
    const card = saves.read(save.id).played[0]!.outcome.reportCard.plan;
    expect(data.reports).toEqual([
      {
        quarter: "2194-Q1",
        new: true,
        overall: {
          score: card.overall.score,
          grade: card.overall.grade,
          binding: card.overall.binding,
          allMet: card.overall.allMet,
          strike: card.overall.score < 70,
        },
        measures: card.measures,
        plan: { picks: null, moves: ["Weekday author nights"] },
        event: null,
        found: [],
      },
    ]);
    expect(data.record).toHaveLength(1);
    expect(JSON.stringify(data)).not.toMatch(/seed|"sales"|outcomeId|"lines"/);
    expect(getStationState(requestFor(save.id)).newReports).toBe(1);

    const html = render(data);
    expect(html).toContain("You have 1 new report.");
    // Its name reads with a space before "new" (Audit, #281).
    expect(html).toMatch(
      /Q1 2194 report<span[^>]*><span[^>]*>, new<\/span><span aria-hidden="true">New<\/span>/,
    );
    expect(html).toContain("Weekday author nights");
    expect(html).toContain("Service record");
    expect(html).toContain("See the full results");
    // One quarter: no chart, the record takes the row; the tiles compare against Q1's own goals.
    expect(html).not.toContain("Overall score by quarter");
    expect(html).toMatch(/Below goal|Goal met/);
    expect(html).toMatch(/Lowest measure: |Every measure met its goal/);
  });

  it("marks a report seen through its action, only for a played quarter, and goes on to its results", async () => {
    const save = saves.create();
    submitPlan(requestFor(save.id, "POST"), { levers: [] });
    const post = (fields: Record<string, string>) => {
      const body = new FormData();
      for (const [k, v] of Object.entries(fields)) body.set(k, v);
      return action({
        request: new Request("http://localhost/reports", {
          method: "POST",
          headers: { origin: "http://localhost", cookie: "orbital_save=" + save.id },
          body,
        }),
      } as Route.ActionArgs);
    };
    for (const quarter of ["2194-Q2", "nope"])
      await expect(post({ quarter })).rejects.toMatchObject({ status: 400 });
    expect(saves.read(save.id).reportsSeen).toBeUndefined();

    expect(await post({ quarter: "2194-Q1" })).toBeNull();
    expect(saves.read(save.id).reportsSeen).toEqual(["2194-Q1"]);
    expect(getStationState(requestFor(save.id)).newReports).toBe(0);
    const revision = saves.read(save.id).revision;
    const to = (await post({ quarter: "2194-Q1", intent: "results" })) as Response;
    expect(to.status).toBe(302);
    expect(to.headers.get("Location")).toBe("/result?quarter=2194-Q1");
    // Already seen: nothing written.
    expect(saves.read(save.id).revision).toBe(revision);
    expect(loader({ request: requestFor(save.id) } as Route.LoaderArgs).reports[0]!.new).toBe(
      false,
    );
  });

  it("still goes on to the results when the save is busy, and leaves the report new", async () => {
    const save = saves.create();
    submitPlan(requestFor(save.id, "POST"), { levers: [] });
    const lock = path.join(directory, "saves", save.id + ".json.lock");
    writeFileSync(lock, "");
    try {
      const body = new FormData();
      body.set("quarter", "2194-Q1");
      body.set("intent", "results");
      const to = (await action({
        request: new Request("http://localhost/reports", {
          method: "POST",
          headers: { origin: "http://localhost", cookie: "orbital_save=" + save.id },
          body,
        }),
      } as Route.ActionArgs)) as Response;
      expect(to.headers.get("Location")).toBe("/result?quarter=2194-Q1");
    } finally {
      rmSync(lock);
    }
    expect(saves.read(save.id).reportsSeen).toBeUndefined();
  });

  it("refuses a save whose seen reports aren't distinct quarters in play order", () => {
    for (const reportsSeen of [
      ["2194-Q2", "2194-Q1"],
      ["2194-Q1", "2194-Q1"],
      ["nope"],
      "2194-Q1",
    ]) {
      const save = saves.create();
      const file = path.join(directory, "saves", save.id + ".json");
      writeFileSync(file, JSON.stringify({ ...saves.read(save.id), reportsSeen }));
      expect(() => saves.read(save.id)).toThrow();
    }
  });
});
