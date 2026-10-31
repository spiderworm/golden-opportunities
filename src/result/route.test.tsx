import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { afterAll, describe, expect, it, vi } from "vitest";

import { getOutcome, submitPlan } from "~/game/game.server";
import type { LeverId } from "~/simulation/types";
import { earnedDiscoveries } from "./discoveries.server";
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
  const loaderData = { outcome, lastQ1: 95245.8, lastQ4: 161524.7, reference: [], discoveries: earnedDiscoveries(outcome.discoveries) };
  const props = { loaderData } as unknown as Route.ComponentProps;
  const Stub = createRoutesStub([{ path: "/result", Component: () => <Result {...props} /> }]);
  return { html: renderToString(<Stub initialEntries={["/result"]} />), outcome };
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
});
