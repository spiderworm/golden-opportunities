import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";

import { Panel, type Chosen } from "./DecideReports";
import type { PlayerReport } from "./player";
import type { ShopReport } from "./shop.server";

const player: PlayerReport[] = [
  {
    id: "r1",
    title: "The quiet picks",
    summary: "Weekdays carry the quarter.",
    items: [
      {
        spec: {
          title: "Revenue by quarter",
          kind: "bar",
          query: { measure: "revenue", by: ["quarter"] },
        },
        note: "Down in Q4.",
      },
    ],
    created: "2194-Q1",
    edited: "2194-Q1",
  },
];
const measure = (id: "profit" | "readers" | "happiness" | "culture", score: number) => ({
  id,
  result: 100,
  lastYear: 90,
  goal: 110,
  score,
  grade: "C" as const,
  met: false,
  exceeds: false,
});
const shop: ShopReport[] = [
  {
    quarter: "2194-Q1",
    new: false,
    overall: { score: 66, grade: "D", binding: ["culture"], allMet: false, strike: true },
    measures: [
      measure("profit", 79),
      measure("readers", 90),
      measure("happiness", 80),
      measure("culture", 66),
    ],
    plan: { picks: null, moves: ["Weekday author nights"] },
    event: null,
    found: ["Sundays sell more hardcovers."],
  },
];

function render(initial: Chosen = null) {
  const Stub = createRoutesStub([
    {
      path: "/decide",
      Component: () => (
        <Panel
          player={player}
          shop={shop}
          quarters={["2193-Q1", "2193-Q2", "2193-Q3", "2193-Q4"]}
          onClose={() => {}}
          onEdit={() => {}}
          initial={initial}
        />
      ),
    },
  ]);
  return renderToString(<Stub initialEntries={["/decide"]} />);
}

describe("Reports in Decide", () => {
  it("lists the player's reports by title, then the shop's under Quarterly reports", () => {
    const html = render();
    expect(html).toMatch(/role="dialog" aria-labelledby="decide-reports-heading"/);
    expect(html).toMatch(/<h2[^>]*>Your reports<\/h2>/);
    expect(html).toContain("The quiet picks");
    expect(html).toContain("Quarterly reports");
    expect(html).toContain("Q1 2194 report: 66 (D)");
    expect(html).toContain("Close");
  });

  it("shows the player's forecasts read-only under the lists, once a quarter is played (src/forecast)", () => {
    const calibrated = (played: number) =>
      renderToString(
        <Panel
          player={[]}
          shop={[]}
          quarters={[]}
          onClose={() => {}}
          onEdit={() => {}}
          calibration={{
            forecast: played,
            played,
            revenue: {
              measure: "revenue",
              n: 0,
              hits: 0,
              hitRate: null,
              bias: null,
              sharpness: null,
              judged: false,
            },
            units: {
              measure: "units",
              n: 0,
              hits: 0,
              hitRate: null,
              bias: null,
              sharpness: null,
              judged: false,
            },
            history: [],
          }}
        />,
      );
    // No reports of the player's own: the panel is titled Your forecasts, with no empty list, and the
    // calibration under it takes no second heading (Plot, section 10).
    expect(calibrated(1)).toMatch(/<h2[^>]*>Your forecasts<\/h2>/);
    expect(calibrated(1)).not.toMatch(/<h3[^>]*>Your forecasts/);
    expect(calibrated(1)).toContain('aria-label="Your forecasts"');
    expect(calibrated(1)).not.toContain('<ul class="');
    expect(calibrated(1)).toContain("1 of 1 quarter forecast");
    expect(calibrated(0)).not.toContain("quarter forecast");
  });

  it("with reports of the player's own, lists them and puts Your forecasts under them, a level down", () => {
    const html = renderToString(
      <Panel
        player={[{ id: "r1", title: "The quiet picks", items: [] } as unknown as PlayerReport]}
        shop={[]}
        quarters={[]}
        onClose={() => {}}
        onEdit={() => {}}
        calibration={{
          forecast: 1,
          played: 1,
          revenue: {
            measure: "revenue",
            n: 0,
            hits: 0,
            hitRate: null,
            bias: null,
            sharpness: null,
            judged: false,
          },
          units: {
            measure: "units",
            n: 0,
            hits: 0,
            hitRate: null,
            bias: null,
            sharpness: null,
            judged: false,
          },
          history: [],
        }}
      />,
    );
    expect(html).toMatch(/<h2[^>]*>Your reports<\/h2>/);
    expect(html.indexOf("The quiet picks")).toBeLessThan(html.indexOf("Your forecasts"));
    expect(html).toMatch(/<h3[^>]*>Your forecasts<\/h3>/);
  });

  it("reads one of the player's reports: summary, charts with notes, and Edit in Reports", () => {
    const html = render({ type: "player", id: "r1" });
    expect(html).toMatch(/<h2[^>]*>The quiet picks<\/h2>/);
    expect(html).toContain("Weekdays carry the quarter.");
    expect(html).toContain("Revenue by quarter");
    expect(html).toContain("Down in Q4.");
    expect(html).toMatch(/aria-pressed="false" aria-label="Table: Revenue by quarter"/);
    expect(html).toContain("Edit in Reports");
    expect(html).toContain("All reports");
    // Read-only: nothing to edit in place.
    expect(html).not.toMatch(/<(input|textarea)/);
  });

  it("shows a shop report's score, goals and plan only: what the player did last time", () => {
    const html = render({ type: "shop", quarter: "2194-Q1" });
    expect(html).toMatch(/<h2[^>]*>Q1 2194 report<\/h2>/);
    expect(html).toContain("66 (D), strike. Lowest measure: Culture.");
    expect(html).toContain("Culture: 100 against a goal of 110, 66 (C)");
    expect(html).toContain("Weekday author nights");
    expect(html).not.toContain("What you found");
    expect(html).not.toContain("Sundays sell more hardcovers.");
  });
});
