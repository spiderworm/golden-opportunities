// Where an app is running, for every studio package (moved from @tellim/analytics, 1 Nov 2026):
// - "testlab": Google Play's pre-launch robots (Firebase Test Lab). The Android
//   app marks its WebView's user agent (packages/analytics/android/TestLab.md); the data is
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

// - emulator: the Android emulator, which the Android app marks on any build
//   (../../analytics/android/TestLab.md). It's always ours, never a player
//   (David, 1 Nov 2026: Cube's and Slice's release-build checks, all on Pacific
//   time), so by default nothing is sent, like automation. To test analytics on
//   one, set localStorage "tellim.emulatorAnalytics" to "1": it then sends as
//   platform "emulator", which reports leave out. A Test Lab mark wins: Play's
//   robots stay "testlab".
export const EMULATOR_MARK = "TellimEmulator";
const LEGACY_EMULATOR_MARKS = ["PizzaEmulator"]; // Pizza's own, debug builds only

export function emulator(userAgent: string): boolean {
  return !testLab(userAgent) && [EMULATOR_MARK, ...LEGACY_EMULATOR_MARKS].some((m) => userAgent.includes(m));
}

/** whether this emulator's analytics are switched on for a test */
export function emulatorSends(store?: Pick<Storage, "getItem">): boolean {
  try {
    return store?.getItem("tellim.emulatorAnalytics") === "1";
  } catch {
    return false;
  }
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
