import { test, expect } from "../fixtures";

// The fake provider answers any question with real lookups (src/assistant/server/fakeLookups.server.ts):
// revenue by quarter, then the latest quarter beside the one before, by genre.
test("a table and a comparison Dewey showed pin to Investigate, where they run again", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/investigate?analytics-test=1");
  await expect(page.getByRole("link", { name: "Write the plan" })).toBeVisible();

  const dewey = page.getByRole("region", { name: "Ask Dewey" });
  const question = dewey.getByRole("textbox", { name: "Question for Dewey" });
  await expect(question).toBeEnabled();
  const table = dewey.getByRole("button", { name: "Pin Revenue by quarter", exact: true });
  // The server answers one question at a time, across every browser (assistant.server.ts), and the other
  // browser's run may be asking: when Dewey says so, ask again, as a player would.
  const busy = dewey.getByText("Dewey is answering another question.");
  for (let attempt = 1; ; attempt++) {
    await question.fill("What was revenue by quarter?");
    await dewey.getByRole("button", { name: "Ask", exact: true }).click();
    await expect(table.or(busy)).toBeVisible();
    if (await table.isVisible()) break;
    expect(attempt, "Dewey stayed busy").toBeLessThan(10);
    await dewey.getByRole("button", { name: "New conversation" }).click();
    await page.waitForTimeout(500);
  }

  const pinned = page.getByRole("region", { name: "Pinned charts" });
  await table.click();
  await expect(
    dewey.getByRole("button", { name: "Pinned: Revenue by quarter", exact: true }),
  ).toBeDisabled();
  const tableCard = pinned.getByRole("article", { name: "Revenue by quarter", exact: true });
  await expect(tableCard).toContainText("Pinned by you");
  await expect(tableCard.getByRole("columnheader", { name: "Revenue" })).toBeVisible();
  await expect(tableCard).toContainText("Source:");

  const comparisonTitle = "Revenue compared across quarter by genre";
  await dewey.getByRole("button", { name: `Pin ${comparisonTitle}`, exact: true }).click();
  const comparisonCard = pinned.getByRole("article", { name: comparisonTitle, exact: true });
  await expect(comparisonCard.getByRole("columnheader", { name: "Change (%)" })).toBeVisible();
  await expect(comparisonCard.getByRole("cell", { name: "All", exact: true })).toBeVisible();
  await expect(comparisonCard).toContainText("compared across quarter");
  await expect(pinned.getByRole("article")).toHaveCount(2);

  // Both survive a reload, and the restored conversation knows they're pinned.
  await page.reload();
  await expect(pinned.getByRole("article")).toHaveCount(2);
  await expect(
    dewey.getByRole("button", { name: "Pinned: Revenue by quarter", exact: true }),
  ).toBeDisabled();
  await expect(
    dewey.getByRole("button", { name: `Pinned: ${comparisonTitle}`, exact: true }),
  ).toBeDisabled();
  expect(errors).toEqual([]);
});
