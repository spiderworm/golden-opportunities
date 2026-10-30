// Where a game is running, as far as analytics cares:
// - "testlab": Google Play's pre-launch robots (Firebase Test Lab). The Android
//   app marks its WebView's user agent (../../android/TestLab.md); the data is
//   still sent, labeled platform "testlab", and reports leave it out (David,
//   27 Oct 2026: labeled, never dropped, so a misdetected player isn't lost).
// - automation: a browser driven by a test (navigator.webdriver) or opened
//   with ?analytics-test=1 (kept for the tab). Nothing is sent and the log has
//   its own keys, so a later real launch can't upload it as early history.
//   That's safe to drop: webdriver is never a player.
export const TEST_LAB_MARK = "TellimTestLab";
const LEGACY_MARKS = ["PizzaTestDevice"]; // Pizza's own, before this moved here

export function testLab(userAgent: string): boolean {
  return [TEST_LAB_MARK, ...LEGACY_MARKS].some((m) => userAgent.includes(m));
}

export function automation(webdriver: boolean, search: string, key: string, session?: Pick<Storage, "getItem" | "setItem">): boolean {
  let on = webdriver || new URLSearchParams(search).get("analytics-test") === "1";
  try {
    on ||= session?.getItem(`${key}.analyticsTest`) === "1";
    if (on) session?.setItem(`${key}.analyticsTest`, "1");
  } catch {
    // a blocked session store mustn't turn sending back on for this page
  }
  return on;
}
