import { readFileSync } from "node:fs";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PHONE_COPY } from "./copy";
import { PHONE_QUERY, sizeBucket } from "./phone";
import { PhoneScreen } from "./PhoneScreen";

describe("the phone screen", () => {
  it("is shown by the same query in its stylesheet as in the browser's check", () => {
    // The stylesheet shows it before the scripts run, so the two must agree.
    expect(readFileSync(new URL("./PhoneScreen.module.css", import.meta.url), "utf8")).toContain(
      `@media ${PHONE_QUERY} {`,
    );
  });

  it("counts a coarse pointer on a short side of 600 px or less as a phone, in either orientation", () => {
    expect(PHONE_QUERY).toBe(
      "(pointer: coarse) and (max-width: 600px), (pointer: coarse) and (max-height: 600px)",
    );
  });

  it("records only the short side, in a coarse bucket", () => {
    expect(sizeBucket(320, 568)).toBe("under 360");
    expect(sizeBucket(390, 844)).toBe("360-399");
    expect(sizeBucket(844, 390)).toBe("360-399");
    expect(sizeBucket(430, 932)).toBe("400-479");
    expect(sizeBucket(600, 960)).toBe("480-600");
  });

  it("serves the plain fact before any script runs, and no stand-in for the scene it hasn't chosen yet", () => {
    const html = renderToString(<PhoneScreen active={false} />);
    expect(html).toContain(`>${PHONE_COPY.fact}</p>`);
    // The boss's line is there to speak, but not yet spoken.
    expect(html).toContain(PHONE_COPY.line);
    expect(html).not.toMatch(/data-speaking="true"/);
    // Nothing stands in for the scene (David, 3 Nov, AGENTS.md "Commit before you show"): no still boss, and no
    // picture named, until the page has committed to the still boss or the 3D scene.
    expect(html).not.toContain("/bosses/full/readers.webp");
    expect(html).not.toContain('role="img"');
  });
});
