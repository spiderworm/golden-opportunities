import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures";

/** Before leaving a page: let what it's fetching arrive (WebKit reports a fetch cut off by navigation). */
const settle = (page: Page) => page.waitForLoadState("networkidle");

/** Plays the quarter open now with the station-wide sale, the one move that always scores under 70. */
async function playTheSale(page: Page, quarter: string) {
  await settle(page);
  await page.goto("/decide?analytics-test=1");
  await expect(page.getByRole("heading", { name: `PLAN FOR ${quarter}` })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole("checkbox", { name: /^Station-wide sale/ }).check();
  await page.getByRole("button", { name: "Submit plan", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page).toHaveURL(/\/result(?:\?|$)/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: `${quarter}: the results` })).toBeVisible();
}

// The endless game's ending (endless.md section 7): three strikes in any four quarters, and the panel removes the
// player. Three sales are three strikes, so the vote comes at Q3 2194, and Play again starts over from January 1.
test("three strikes, and the panel removes the player at Q3 2194; Play again starts over", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto("/?analytics-test=1");
  await page
    .getByRole("dialog", { name: "Transmission from the Commerce Office" })
    .getByRole("button", { name: "Later" })
    .click();
  await expect(page.getByRole("button", { name: "Notifications", exact: true })).toBeVisible();

  await playTheSale(page, "Q1 2194");
  await expect(page.getByRole("link", { name: "Continue to Q2", exact: true })).toBeVisible();
  await playTheSale(page, "Q2 2194");
  await expect(page.getByRole("link", { name: "Continue to Q3 2194", exact: true })).toBeVisible();
  await playTheSale(page, "Q3 2194");

  // The vote, in place of the way on.
  await expect(page.getByRole("heading", { name: "The panel has voted" })).toBeVisible();
  await expect(
    page.getByText("THE PANEL HAS CONVENED. THE VOTE WAS UNANIMOUS.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText(
      /You were removed after three quarters with an overall score under 70 in four: Q1 2194 \(\d+\), Q2 2194 \(\d+\) and Q3 2194 \(\d+\)\. You ran Orbital Books for 3 quarters, from Q1 2194 to Q3 2194\./,
    ),
  ).toBeVisible();
  await expect(page.getByText("Removed by the panel, October 1, 2194.")).toBeVisible();
  await expect(page.getByRole("link", { name: /^Continue to/ })).toHaveCount(0);

  // No plan can be filed: Decide sends the player back to the results.
  await settle(page);
  await page.goto("/decide?analytics-test=1");
  await expect(page).toHaveURL(/\/result(?:\?|$)/);

  // Play again: a new save from January 1, with Q1's memo.
  const before = (await page.context().cookies()).find((c) => c.name === "orbital_save")?.value;
  await page.getByRole("button", { name: "Play again" }).click();
  await expect(page).toHaveURL(/\/(?:\?|$)/);
  await expect(
    page.getByRole("dialog", { name: "Transmission from the Commerce Office" }),
  ).toContainText("THE NUMBERS HAVE GONE DOWN.");
  await expect(page.locator("time")).toHaveText("1 Jan 2194");
  const after = (await page.context().cookies()).find((c) => c.name === "orbital_save")?.value;
  expect(after).toBeTruthy();
  expect(after).not.toBe(before);
});
