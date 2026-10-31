import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BossBriefing } from "./BossBriefing";
import { BossScene2D } from "./BossScene2D";
import type { SceneBubble } from "./useBossFocus";

const bubbles: SceneBubble[] = [
  { boss: "overall", teaser: "ATTENTION.", line: "ATTENTION. A WHOLE LINE.", facts: <p>Fact one.</p> },
  { boss: "profit", teaser: "PROFIT.", line: "PROFIT. A WHOLE LINE.", facts: <p>Fact two.</p> },
];

describe("the 2D boss scene", () => {
  it("draws the open bubble it's given, with its full line, and the teasers elsewhere", () => {
    const html = renderToString(<BossScene2D bubbles={bubbles} open={1} onSelect={() => {}} />);
    expect([...html.matchAll(/aria-expanded="(true|false)"/g)].map((m) => m[1])).toEqual(["false", "true"]);
    expect(html).toContain(">ATTENTION.</span>");
    expect(html).toContain(">PROFIT. A WHOLE LINE.</span>");
    expect(html).toMatch(/<li[^>]*data-open="true"[^>]*style="--tint:#199e70;--order:1"/);
    // Each button controls its own facts; the closed one's are hidden.
    const controls = [...html.matchAll(/aria-controls="([^"]+)"/g)].map((m) => m[1]!);
    expect(new Set(controls).size).toBe(2);
    const panels = [...html.matchAll(/<div id="([^"]+)" class="[^"]*"( hidden="")?>/g)].map((m) => [m[1], Boolean(m[2])]);
    expect(panels).toEqual([[controls[0], true], [controls[1], false]]);
  });

  it("stands each boss in the scene as decoration: the name in the bubble says who", () => {
    const html = renderToString(<BossScene2D bubbles={bubbles} open={0} onSelect={() => {}} />);
    expect(html.match(/<div class="[^"]*figure[^"]*" aria-hidden="true">/g)).toHaveLength(2);
    expect(html).toContain('<img src="/bosses/overall.webp" alt=""');
  });

  it("opens the first bubble in a briefing unless told otherwise", () => {
    const expanded = (html: string) => [...html.matchAll(/aria-expanded="(true|false)"/g)].map((m) => m[1]);
    expect(expanded(renderToString(<BossBriefing bubbles={bubbles} />))).toEqual(["true", "false"]);
    expect(expanded(renderToString(<BossBriefing bubbles={bubbles} initial={1} />))).toEqual(["false", "true"]);
  });
});
