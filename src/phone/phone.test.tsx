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

  it("serves the boss's words, the plain fact and the scene's name before any script runs", () => {
    const html = renderToString(<PhoneScreen active={false} />);
    // The still picture is what's there until a 3D scene draws, so it's the still picture's name.
    expect(html).toContain(`role="img" aria-label="${PHONE_COPY.still}"`);
    expect(html).toContain(PHONE_COPY.line);
    expect(html).toContain(`>${PHONE_COPY.fact}</p>`);
    // Without the scene, the Subcommittee stands there in full, saying it already.
    expect(html).toContain('<img src="/bosses/full/readers.webp" alt="" loading="lazy"');
    expect(html).toMatch(/data-speaking="true"/);
  });
});
