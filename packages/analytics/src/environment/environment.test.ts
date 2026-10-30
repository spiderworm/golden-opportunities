import { test } from "node:test";
import assert from "node:assert/strict";
import { automation, testLab } from "./environment.ts";

test("the Android app's test-lab mark (and Pizza's older one) is recognized", () => {
  assert.equal(testLab("Mozilla/5.0 (Linux; Android 14; Pixel 5 Build/X; wv) Chrome/120 TellimTestLab"), true);
  assert.equal(testLab("Mozilla/5.0 ... PizzaTestDevice"), true);
  assert.equal(testLab("Mozilla/5.0 (Linux; Android 17; Pixel 8 Pro; wv) Chrome/140"), false);
});

test("automation: webdriver or ?analytics-test=1, and it sticks for the tab", () => {
  const m = new Map<string, string>();
  const session = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  assert.equal(automation(false, "", "g", session), false);
  assert.equal(automation(false, "?analytics-test=1", "g", session), true);
  assert.equal(automation(false, "?other=1", "g", session), true, "remembered for the tab");
  assert.equal(automation(true, "", "h"), true);
});
