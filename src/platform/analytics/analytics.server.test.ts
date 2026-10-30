import { expect, test } from "vitest";
import { sendingEnabled } from "./analytics.server";

test("the server sends unless switched off or under test", () => {
  expect(sendingEnabled({})).toBe(true);
  expect(sendingEnabled({ ORBITAL_ANALYTICS: "off" })).toBe(false);
  expect(sendingEnabled({ NODE_ENV: "test" })).toBe(false);
  expect(sendingEnabled({ VITEST: "true" })).toBe(false);
});
