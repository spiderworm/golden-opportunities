import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { afterAll, describe, expect, it, vi } from "vitest";

import { getOutcome, submitPlan } from "~/game/game.server";
import tables from "~/bookshop/data.json";
import { joinBookshop } from "~/bookshop/joins";
import type { BookshopTables } from "~/bookshop/types";
import { q2Candidates, simulateQ2 } from "~/simulation/q2";
import type { LeverId, Q2Plan } from "~/simulation/types";
import { earnedDiscoveries } from "./discoveries.server";
import type { ResultData } from "./result-data";
import type { Route } from "./+types/route";
import Result from "./route";

const directory = await vi.hoisted(async () => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  return mkdtempSync(tmpdir() + '/orbital-result-');
});
vi.mock('~/platform/analytics/instance.server', () => ({ DATA_DIR: directory }));
vi.mock('~/platform/analytics/analytics.server', () => ({ trackServer: vi.fn() }));
import { rmSync } from 'node:fs';
import { saves } from '~/game/session.server';
afterAll(() => rmSync(directory, { recursive: true, force: true }));

function render(...levers: LeverId[]) {
  const save = saves.create();
  saves.update(save.id, save.revision, draft => { draft.seed = 1; });
  const request = new Request('http://localhost/result', { method: 'POST', headers: {
    origin: 'http://localhost', cookie: 'orbital_save=' + save.id,
  } });
  submitPlan(request, { levers });
  const outcome = getOutcome(request)!;
  const loaderData: ResultData = {
    quarter: "2194-Q1",
    outcome,
    sameQuarterLastYear: 95245.8,
    previousQuarter: 161524.7,
    reference: [],
    discoveries: earnedDiscoveries(outcome.discoveries),
    next: null,
    canPlayAgain: false,
    halfYear: null,
    lastYearLabel: "Q1 2193", referenceLabel: "Q4 2193", record: [], removed: null,
  };
  return { html: show(loaderData), outcome };
}

function show(loaderData: ResultData) {
  const props = { loaderData } as unknown as Route.ComponentProps;
  const Stub = createRoutesStub([{ path: "/result", Component: () => <Result {...props} /> }]);
  return renderToString(<Stub initialEntries={["/result"]} />);
}

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

const data = joinBookshop(tables as BookshopTables);
const LAND_WATER_SKY_SPACE = q2Candidates(data).find((c) => c.title === "Land Water Sky Space" && c.format === "Hardcover")!.isbn;
const QUIET: Q2Plan = { picks: [LAND_WATER_SKY_SPACE, null, null], levers: ["events"] };

/** Q2's screen, from the real engine; the half-year review as the game would give it. */
function renderQ2(plan: Q2Plan = QUIET, halfYear: ResultData["halfYear"] = null) {
  // The game records Q2's ids from #141's follow-up; the screen shows whatever the loader put into words.
  const outcome = { ...simulateQ2(plan, 3, data).outcome, discoveries: [] };
  return show({
    quarter: "2194-Q2",
    outcome,
    sameQuarterLastYear: 164436.9,
    previousQuarter: 100_000,
    reference: [{ month: "01", revenue: 30_000 }, { month: "02", revenue: 32_000 }, { month: "03", revenue: 38_000 }],
    discoveries: earnedDiscoveries(["F"], "2194-Q2"),
    next: null,
    canPlayAgain: halfYear !== null,
    halfYear,
    lastYearLabel: "Q2 2193", referenceLabel: "Q1 2194", record: [], removed: null,
  });
}

describe("the result screen", () => {

  it("labels every rule the plan used, in words as well as color", () => {
    const { html, outcome } = render("events");
    expect(html.match(/Your plan used this rule\./g)).toHaveLength(outcome.assumptions.filter((a) => a.usedByPlan).length);
  });

  it("says holding course plainly on the tiles when no moves were chosen", () => {
    expect(render().html.match(/Your plan was to hold course/g)).toHaveLength(3);
  });

  it("leads with the overall score, and tags the measures that set it", () => {
    const { html, outcome } = render("repick", "events");
    const { overall } = outcome.reportCard.plan;
    expect(html).toContain("Overall score");
    expect(html).toContain("Your overall score is your lowest measure.");
    // Before the table: the score, then the lowest measure's boss.
    expect(html.indexOf("Overall score")).toBeLessThan(html.indexOf("<table"));
    expect(html.indexOf("SET YOUR SCORE")).toBeLessThan(html.indexOf("<table"));
    if (!overall.allMet) expect(html.match(/data-binding="true"/g)).toHaveLength(overall.binding.length);
    expect(html.match(/Sets your score/g)?.length ?? 0).toBe(overall.allMet ? 0 : overall.binding.length);
  });

  it("keeps the other bosses in a closed disclosure, Administrator included", () => {
    const { html } = render("sale");
    expect(html).toMatch(/<details[^>]*><summary>What the bosses said<\/summary>/);
    expect(html).toContain("The Commerce Office");
    expect(html).toMatch(/OVERALL SCORE: \d+\./);
    expect(html).not.toMatch(/\d-</);
  });

  it("signs every certificate with the issuer's small print", () => {
    const { html, outcome } = render("repick", "events");
    const certificates = outcome.reportCard.plan.certificates.length;
    expect(certificates).toBeGreaterThan(0);
    expect(html.match(/<li><span>[^<]+<\/span><small[^>]*>Issued by the Center for Shopkeepers Who Can&#x27;t Sell Good<\/small><\/li>/g)).toHaveLength(certificates);
  });

  it("drops the comparison column when the plan was to hold course", () => {
    expect(render().html).not.toContain(`<th scope="col">If you had held course</th>`);
    expect(render("sale").html).toContain(`<th scope="col">If you had held course</th>`);
  });

  it("after Q1, offers Continue to Q2 to the station, but only while Q2 is still to play", () => {
    const { outcome } = render("events");
    const base: ResultData = { quarter: "2194-Q1", outcome, sameQuarterLastYear: 95245.8, previousQuarter: 161524.7, reference: [], discoveries: earnedDiscoveries([]), next: "2194-Q2", canPlayAgain: false, halfYear: null, lastYearLabel: "Q1 2193", referenceLabel: "Q4 2193", record: [], removed: null, };
    const html = show(base);
    expect(html).toMatch(/<a[^>]*href="\/"[^>]*>Continue to Q2<\/a>/);
    expect(text(html)).toContain("Back to the ledgers");
    // Once Q2 has started, Q1's screen is still there, without it, and nothing replaces it (q2.md, #139).
    expect(show({ ...base, next: null })).not.toContain("Continue to Q2");
    // Not even the half-year review, which the game gives every quarter's data once both are played.
    const after = show({ ...base, next: null, canPlayAgain: true, halfYear: { quarters: [], score: 76, grade: "C+" } });
    expect(after).not.toContain("Half-year review");
    expect(after).not.toContain("Play again");
  });
});

describe("Q2's result screen", () => {
  it("is Q1's screen for Q2: its title, columns, goals note, reference line and season note", () => {
    const page = text(renderQ2());
    expect(page).toContain("Q2 2194: the results");
    expect(page).toContain("Q2 2193 + new volume");
    expect(page).toContain("Each goal is Q2 2193, plus the new volume's expected effect, plus 5%. Matching Q2 2193 plus the new volume scores 70 (C\u2212). Meeting the goal scores 100 (A+).");
    expect(page).toContain("Q1 2194 (for reference)");
    expect(page).not.toContain("Q4 2193");
    expect(page).toMatch(/Q2 revenue was \d+% above Q1 2194\. Last year, Q2 was the busier quarter: \$164,437, 73% above Q1\. To judge your plan, compare it with holding course, not with Q1\./);
  });

  it("shows Q2's discoveries, D to F, and without the review, the ledgers link and the service record", () => {
    const page = text(renderQ2());
    expect(page).toContain("You compared your first quarter with last year's.");
    expect(page).toContain("Look at the average rating, title by title.");
    expect(page).toContain("1 of 3 found.");
    expect(page).not.toContain("Weekdays emptied");
    // Without the review (the endless game, going on past Q2): no Play again, the ledgers link in What happened,
    // and the service record in the review's place (endless.md section 6).
    expect(page).not.toContain("Play again");
    expect(page).toContain("Back to the ledgers");
    expect(page).toContain("Service record");
    expect(page).not.toContain("Continue to Q2");
  });

  it("says holding course when there are no picks and no move, and not when there's only a pick", () => {
    expect(text(renderQ2({ picks: [null, null, null], levers: [] }))).toContain("Your plan was to hold course");
    expect(text(renderQ2({ picks: [null, LAND_WATER_SKY_SPACE, null], levers: [] }))).not.toContain("Your plan was to hold course");
  });

  it("closes with the half-year review: a row per quarter in scores, the game's half-year score, the Administrator, and a new game", () => {
    const measures = (score: number) => (["profit", "readers", "happiness", "culture"] as const).map((id, i) => ({ id, score: score + i, grade: "C" as const, result: 0, lastYear: 0, goal: 0, met: false, exceeds: false }));
    const html = renderQ2(QUIET, {
      quarters: [
        { quarter: "2194-Q1", measures: measures(80), overall: { score: 80, grade: "B-" } },
        { quarter: "2194-Q2", measures: measures(71), overall: { score: 71, grade: "C-" } },
      ],
      score: 76,
      grade: "C+",
    });
    const page = text(html);
    expect(page).toContain("Half-year review");
    expect(html).toMatch(/<th scope="col">Quarter<\/th><th scope="col">Profit<\/th><th scope="col">Readers served<\/th><th scope="col">Happiness<\/th><th scope="col">Culture<\/th><th scope="col">Overall<\/th>/);
    expect(html).toMatch(/<th scope="row">Q1 2194<\/th><td>80 \(C\)<\/td><td>81 \(C\)<\/td><td>82 \(C\)<\/td><td>83 \(C\)<\/td><td>80 \(B\u2212\)<\/td>/);
    expect(html).toMatch(/<th scope="row">Q2 2194<\/th><td>71 \(C\)<\/td>.*<td>71 \(C\u2212\)<\/td>/);
    // The game's score, as given: never averaged again here.
    expect(page).toContain("Half-year score: 76 (C+)");
    expect(page).toContain("HALF-YEAR SCORE: 76. THE SHOP CONTINUES. THIS IS ALSO A LOOK.");
    expect(page).toContain("That's the end of the first half of 2194. Thanks for minding the shop.");
    const form = html.match(/<form[^>]*>.*?<\/form>/)?.[0] ?? "";
    expect(form).toMatch(/action="\/game\/new"/);
    expect(form).toMatch(/method="post"/);
    expect(form).toMatch(/<button type="submit"[^>]*>Play again<\/button>/);
    expect(html).toMatch(/<a[^>]*href="\/investigate"[^>]*>Back to the ledgers<\/a>/);
    // Play again sits after the review's closing line, and the review after the discoveries.
    expect(page.indexOf("of 3 found.")).toBeLessThan(page.indexOf("Half-year review"));
  });
});

describe("a later quarter's result screen (endless-copy.md section 4)", () => {
  const row = (quarter: string, score: number, grade: string, event: ResultData["record"][number]["event"] = null) => ({
    quarter: quarter as never,
    measures: (["profit", "readers", "happiness", "culture"] as const).map((id) => ({ id, result: 0, lastYear: 0, goal: 0, score: score + 2, grade: grade as never, met: false, exceeds: false })),
    overall: { score, grade: grade as never },
    strike: score < 70,
    event,
  });
  function renderQ3(next: ResultData["next"] = "2194-Q4") {
    const outcome = { ...simulateQ2(QUIET, 3, data).outcome, discoveries: [] };
    return text(
      show({
        quarter: "2194-Q3",
        outcome,
        sameQuarterLastYear: 274036.2,
        previousQuarter: 150_000,
        reference: [],
        discoveries: earnedDiscoveries([], "2194-Q3"),
        next,
        canPlayAgain: false,
        halfYear: null,
        lastYearLabel: "Q3 2193",
        referenceLabel: "Q2 2194",
        record: [row("2194-Q1", 66, "D"), row("2194-Q2", 74, "C"), row("2194-Q3", 81, "B-", { type: "quiet_days", params: { weekday: "Tuesday", percent: 15 } })],
        removed: null,
      }),
    );
  }

  it("names the quarter, its reference and last year's adjusted quarter, and continues to the next", () => {
    const page = renderQ3();
    expect(page).toContain("Q3 2194: the results");
    expect(page).toContain("Q2 2194 (for reference)");
    expect(page).toContain("Q3 2193, adjusted");
    expect(page).toContain("Each goal is Q3 2193, adjusted for what the Council expected this quarter, plus 5%.");
    expect(page).toContain("To judge your plan, compare it with holding course, not with Q2 2194.");
    expect(page).toContain("Continue to Q4 2194");
    expect(page).toContain("Back to the ledgers");
    expect(page).not.toContain("Half-year review");
  });

  it("ends with the service record: newest first, strikes marked, events by their short titles, tenure and best", () => {
    const page = renderQ3();
    expect(page).toContain("Service record");
    expect(page.indexOf("Q3 2194 ")).toBeLessThan(page.indexOf("Q1 2194 "));
    expect(page).toContain("66 (D), strike");
    expect(page).toContain("Quiet Tuesdays");
    expect(page).toContain("The new Inspector Ryeslton volume");
    expect(page).toContain("Manager since January 1, 2194: 3 quarters. Average overall score: 74 (C).");
    expect(page).toContain("Best quarter: Q3 2194, 81 (B-).");
  });

  it("doesn't offer to continue from a quarter that isn't the last one played", () => {
    expect(renderQ3("2195-Q1")).not.toContain("Continue to");
  });
});
