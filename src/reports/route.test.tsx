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
import Reports, { loader } from "./route";
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
    expect(data).toEqual({ quarters: [], newReports: 0 });
    expect(getStationState(requestFor(save.id)).newReports).toBe(0);
    const html = render(data);
    expect(html).toContain("No new reports.");
    expect(html).toContain("No quarter has been filed yet.");
  });

  it("lists each played quarter's report, new until seen, and sends nothing of the save", () => {
    const save = saves.create();
    submitPlan(requestFor(save.id, "POST"), { levers: [] });
    const data = loader({ request: requestFor(save.id) } as Route.LoaderArgs);
    expect(data).toEqual({
      quarters: [{ quarter: "2194-Q1", label: "Q1 2194", new: true }],
      newReports: 1,
    });
    expect(JSON.stringify(data)).not.toMatch(/seed|"sales"|outcomeId/);
    expect(getStationState(requestFor(save.id)).newReports).toBe(1);
    const html = render(data);
    expect(html).toContain("You have 1 new report.");
    expect(html).toMatch(/Q1 2194 report<span[^>]*>New<\/span>/);
    expect(html).toContain('href="/result?quarter=2194-Q1"');

    saves.update(save.id, saves.read(save.id).revision, (draft) => {
      draft.reportsSeen = ["2194-Q1"];
    });
    expect(loader({ request: requestFor(save.id) } as Route.LoaderArgs).newReports).toBe(0);
    expect(getStationState(requestFor(save.id)).newReports).toBe(0);
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
