import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BossBriefing } from "./BossBriefing";
import { BossScene2D } from "./BossScene2D";
import type { SceneBubble } from "./useBossFocus";

const bubbles: SceneBubble[] = [
  { boss: "overall", teaser: "ATTENTION.", line: "ATTENTION. A WHOLE LINE.", facts: <p>Fact one.</p> },
  { boss: "profit", teaser: "PROFIT.", line: "PROFIT. A WHOLE LINE.", facts: <p>Fact two.</p> },
];

const expanded = (html: string) => [...html.matchAll(/aria-expanded="(true|false)"/g)].map((m) => m[1]);

describe("the 2D boss scene", () => {
  it("keeps every teaser in its bubble, and shows the open boss's full line and facts in the panel", () => {
    const html = renderToString(<BossScene2D bubbles={bubbles} open={1} onSelect={() => {}} />);
    expect(expanded(html)).toEqual(["false", "true"]);
    expect(html).toContain(">ATTENTION.</span>");
    expect(html).toContain(">PROFIT.</span>");
    // Each button controls its own panel; both panels are laid out (so the box never resizes), one shown.
    const controls = [...html.matchAll(/aria-controls="([^"]+)"/g)].map((m) => m[1]!);
    const panels = [...html.matchAll(/<div id="([^"]+)" class="[^"]*panel[^"]*"( data-open="true")?/g)].map((m) => [m[1], Boolean(m[2])]);
    expect(panels).toEqual([[controls[0], false], [controls[1], true]]);
    // The open bubble's button is described by its panel; the closed one's isn't.
    expect([...html.matchAll(/aria-describedby="([^"]+)"/g)].map((m) => m[1])).toEqual([controls[1]]);
    expect(html).toMatch(/data-open="true" style="--tint:#199e70"><p[^>]*>The Commerce Office<\/p><div class="[^"]*facts[^"]*"><p>Fact two\.<\/p><\/div><p[^>]*>PROFIT\. A WHOLE LINE\.<\/p>/);
  });

  it("stands each boss on the floor as decoration that opens its bubble when clicked", () => {
    const html = renderToString(<BossScene2D bubbles={bubbles} open={0} onSelect={() => {}} />);
    expect(html.match(/<div class="[^"]*figure[^"]*" data-boss="(overall|profit)"( data-open="true")? aria-hidden="true"/g)).toHaveLength(2);
    expect(html).toContain('<img src="/bosses/full/overall.webp" alt=""');
    // The figure isn't a second control: the bubble is the one button per boss.
    expect(html.match(/<button/g)).toHaveLength(2);
  });

  it("opens the first bubble in a briefing unless told otherwise", () => {
    expect(expanded(renderToString(<BossBriefing bubbles={bubbles} />))).toEqual(["true", "false"]);
    expect(expanded(renderToString(<BossBriefing bubbles={bubbles} initial={1} />))).toEqual(["false", "true"]);
  });
});
