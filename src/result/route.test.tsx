import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { afterEach, describe, expect, it } from "vitest";

import { getOutcome, resetStub, submitPlan } from "~/game-stub/game.server";
import type { Route } from "./+types/route";
import Result from "./route";

const request = new Request("http://localhost/result");

function render(option: "A" | "D") {
  submitPlan(request, { option });
  const outcome = getOutcome(request)!;
  const loaderData = { outcome, lastQ1: 95245.8, lastQ4: 161524.7, reference: [] };
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
});
