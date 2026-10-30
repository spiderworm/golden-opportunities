import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { afterEach, describe, expect, it } from "vitest";

import { getOutcome, resetStub, submitPlan } from "~/game-stub/game.server";
import type { LeverId } from "~/simulation/types";
import { earnedDiscoveries } from "./discoveries.server";
import type { Route } from "./+types/route";
import Result from "./route";

const request = new Request("http://localhost/result");

function render(...levers: LeverId[]) {
  submitPlan(request, { levers });
  const outcome = getOutcome(request)!;
  const loaderData = { outcome, lastQ1: 95245.8, lastQ4: 161524.7, reference: [], discoveries: earnedDiscoveries(outcome.discoveries) };
  const props = { loaderData } as unknown as Route.ComponentProps;
  const Stub = createRoutesStub([{ path: "/result", Component: () => <Result {...props} /> }]);
  return { html: renderToString(<Stub initialEntries={["/result"]} />), outcome };
}

describe("the result screen", () => {
  afterEach(resetStub);

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

  it("drops the comparison column when the plan was to hold course", () => {
    expect(render().html).not.toContain(`<th scope="col">If you had held course</th>`);
    expect(render("sale").html).toContain(`<th scope="col">If you had held course</th>`);
  });
});
