import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BossAvatar, BossBubble } from "./BossBubble";
import { BOSSES } from "./bosses";

describe("BossBubble", () => {
  it("quotes the boss in a bubble, names it, and staggers its entrance", () => {
    const html = renderToString(
      <BossBubble boss="profit" order={2}>
        WE HAVE REVIEWED YOUR QUARTER.
      </BossBubble>,
    );
    expect(html).toMatch(/<figure[^>]*style="--tint:#199e70;--order:2"/);
    expect(html).toMatch(/<blockquote[^>]*>WE HAVE REVIEWED YOUR QUARTER\.<\/blockquote>/);
    expect(html).not.toContain("facts");
    expect(html).toMatch(/<figcaption[^>]*>The Commerce Office<\/figcaption>/);
  });

  it("sets the facts apart from the joke, as real text", () => {
    const html = renderToString(
      <BossBubble boss="overall" facts={<p>Your plan runs from <strong>January 1 to March 31, 2194</strong>.</p>}>
        ATTENTION, SHOPKEEPER.
      </BossBubble>,
    );
    expect(html).toMatch(/<\/blockquote><div class="[^"]*facts[^"]*"><p>Your plan runs from <strong>January 1 to March 31, 2194<\/strong>\.<\/p><\/div>/);
    // The name comes first, so the player knows who's speaking before reading the line.
    expect(html.indexOf("The Station Administrator")).toBeLessThan(html.indexOf("ATTENTION"));
  });

  it("shows a decorative robot face until the boss has a portrait, and the portrait after", () => {
    expect(renderToString(<BossAvatar />)).toMatch(/^<div[^>]*aria-hidden="true"[^>]*><svg/);
    expect(renderToString(<BossAvatar portrait="/bosses/commerce.webp" />)).toContain('<img src="/bosses/commerce.webp" alt=""');
  });

  it("has a boss for every measure and the overall score, each in its own tint", () => {
    expect(Object.keys(BOSSES).sort()).toEqual(["culture", "happiness", "overall", "profit", "readers"]);
    const bosses = Object.values(BOSSES);
    expect(new Set(bosses.map((b) => b.tint)).size).toBe(bosses.length);
  });
});
