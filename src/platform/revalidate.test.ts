import { describe, expect, it } from "vitest";

import { revalidateAbovePage } from "./revalidate";

const args = (from: string, to: string, formMethod?: string) =>
  ({ currentUrl: new URL(from, "http://localhost"), nextUrl: new URL(to, "http://localhost"), formMethod, defaultShouldRevalidate: true }) as never;

describe("the loaders above a page", () => {
  it("don't run again for a new question on the same page", () => {
    expect(revalidateAbovePage(args("/investigate", "/investigate?genre=Fiction"))).toBe(false);
  });

  it("run as usual for anything else: another page, or any action", () => {
    expect(revalidateAbovePage(args("/investigate", "/settings"))).toBe(true);
    expect(revalidateAbovePage(args("/decide", "/decide", "POST"))).toBe(true);
    expect(revalidateAbovePage(args("/result", "/result", "POST"))).toBe(true);
  });
});
