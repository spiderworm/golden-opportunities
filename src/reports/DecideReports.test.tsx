import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";

import { Panel, type Chosen } from "./DecideReports";
import { ReportCharts } from "./PlayerReports";
import type { PlayerReport } from "./player";
import type { ShopReport } from "./shop.server";
import type { Segment } from "~/segments/segments";

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
    // Read-only: nothing to edit in place. Run for…'s picker is radios, a view that changes nothing saved.
    expect(html).not.toMatch(/<textarea|<input(?![^>]*type="radio")/);
    expect(html).toContain("Run for…");
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

describe("a report's segment on its charts (Plot, Chart and Audit, #407)", () => {
  const quarters = ["2193-Q1", "2193-Q2", "2193-Q3", "2193-Q4"];
  const report = (segment: string, carried?: string): PlayerReport => ({
    id: "r2",
    title: "Segmented",
    items: [
      {
        spec: {
          title: "Revenue by genre",
          kind: "bar",
          query: { measure: "revenue", by: ["genre"], filter: { format: ["Trade paperback"] } },
          ...(carried ? { segment: carried } : {}),
        },
      },
    ],
    segment,
    created: "2194-Q1",
    edited: "2194-Q1",
  });
  const show = (r: PlayerReport, segments: Segment[]) => {
    const Stub = createRoutesStub([
      {
        path: "/decide",
        Component: () => (
          <Panel
            player={[r]}
            shop={[]}
            quarters={quarters}
            segments={segments}
            onClose={() => {}}
            onEdit={() => {}}
            initial={{ type: "player", id: r.id }}
          />
        ),
      },
    ]);
    return renderToString(<Stub initialEntries={["/decide"]} />)
      .replace(/&#x27;/g, "'")
      .replace(/&quot;/g, '"');
  };
  const hardcovers: Segment = { id: "h1", name: "Hardcovers", filters: { format: ["Hardcover"] } };
  const fiction: Segment = { id: "f1", name: "Fiction", filters: { genre: ["Fiction"] } };

  it("says what the report shows, and where nothing matches, says so with Table off and no caption", () => {
    const html = show(report("h1"), [hardcovers]);
    expect(html).toContain("Every chart here shows Hardcovers.");
    expect(html).toContain("Nothing matches both this chart's filters and Hardcovers.");
    expect(html).toContain("Nothing matches, so there's no table or chart");
    expect(html).toMatch(/aria-disabled="true"/);
    expect(html).not.toContain("Every quarter played so far");
    expect(show(report("f1"), [fiction])).toContain("Every quarter played so far");
  });

  it("decides the caption from the filters the chart runs with: its segment's now", () => {
    const quartered: Segment = {
      id: "p1",
      name: "Paperbacks lately",
      filters: { format: ["Trade paperback"], quarter: ["2193-Q4"] },
    };
    const html = show(report("f1", "p1"), [fiction, quartered]);
    expect(html).toContain("Segment: Paperbacks lately");
    expect(html).not.toContain("Every quarter played so far");
  });
});

describe("a report run for another quarter (Plot, section 9)", () => {
  const quarters = ["2193-Q1", "2193-Q2", "2193-Q3", "2193-Q4"];
  const items: PlayerReport["items"] = [
    {
      spec: {
        title: "Revenue by genre, Q3",
        kind: "bar",
        query: { measure: "revenue", by: ["genre"], filter: { quarter: ["2193-Q3"] } },
      },
    },
    {
      spec: {
        title: "Revenue by quarter",
        kind: "bar",
        query: { measure: "revenue", by: ["quarter"] },
      },
    },
    {
      spec: {
        title: "Revenue by genre, Q1",
        kind: "bar",
        query: { measure: "revenue", by: ["genre"], filter: { quarter: ["2193-Q1"] } },
      },
    },
  ];
  const show = (runFor: string | null) =>
    renderToString(
      <ReportCharts items={items} quarters={quarters} segments={[]} runFor={runFor} />,
    ).replace(/&#x27;/g, "'");

  it("says which charts show as saved, and why; as saved, says nothing", () => {
    // Newest is Q3; run for Q4 moves every chart on by one. Over every quarter stays; Q1 moves to Q2.
    const html = show("2193-Q4");
    expect(html).toContain("Over every quarter, so it stays as saved.");
    expect(html).not.toContain("past the ledgers");
    // Run for Q2 moves back one: Q1 would go past the ledgers.
    expect(show("2193-Q2")).toContain(
      "Moving this chart would go past the ledgers, so it shows as saved.",
    );
    expect(show(null)).not.toContain("as saved");
  });

  it("offers As saved, the relative quarters and each played quarter, newest first", async () => {
    const { RunForPicker } = await import("./RunFor");
    const html = renderToString(
      <RunForPicker choice="saved" quarters={quarters} onChoose={() => {}} />,
    );
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    expect(text).toContain("Run for…");
    expect(text).toMatch(
      /Run this report for As saved Latest quarter: Q4 2193 Quarter before latest: Q3 2193 Same quarter, a year earlier .*Q4 2193 Q3 2193 Q2 2193 Q1 2193/,
    );
  });
});
