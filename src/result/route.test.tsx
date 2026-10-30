import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { afterEach, describe, expect, it } from "vitest";

import { getOutcome, resetStub, submitPlan } from "~/game-stub/game.server";
import { earnedDiscoveries } from "./discoveries.server";
import type { Route } from "./+types/route";
import Result from "./route";

const request = new Request("http://localhost/result");

function render(option: "A" | "B" | "D") {
  submitPlan(request, { option });
  const outcome = getOutcome(request)!;
  const loaderData = { outcome, lastQ1: 95245.8, lastQ4: 161524.7, reference: [], discoveries: earnedDiscoveries(outcome.discoveries) };
  const props = { loaderData } as unknown as Route.ComponentProps;
  const Stub = createRoutesStub([{ path: "/result", Component: () => <Result {...props} /> }]);
  return renderToString(<Stub initialEntries={["/result"]} />);
}

describe("the result screen", () => {
  afterEach(resetStub);

  it("labels every rule the plan used, in words as well as color", () => {
    const html = render("D");
    expect(html.match(/Your plan used this rule\./g)).toHaveLength(4);
  });

  it("says holding course plainly on option A's tiles", () => {
    expect(render("A").match(/Your plan was to hold course/g)).toHaveLength(3);
  });

  it("shows the report card as a table, with holding course beside the plan", () => {
    const html = render("B");
    expect(html).toContain("<table");
    for (const name of ["Profit", "Readers served", "Happiness", "Culture"]) expect(html).toContain(`<th scope="row">${name}</th>`);
    expect(html).toContain("If you had held course");
    expect(html).not.toMatch(/\d-</);
    expect(html).toContain("The Commerce Office");
    expect(html).toMatch(/COMBINED SCORE: \d+\./);
  });

  it("drops the comparison column when the plan was to hold course", () => {
    expect(render("A")).not.toContain(`<th scope="col">If you had held course</th>`);
  });
});
