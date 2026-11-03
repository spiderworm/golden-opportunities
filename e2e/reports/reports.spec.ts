import { collectPageErrors, test, expect } from "../fixtures";

// Reports (docs/design/reports.md section 9's tests): a report built from two pins, one ticked on Reports and one
// added from Investigate's "Add to report", kept in the save, then read in Decide's panel beside the plan, which
// keeps the form's state; and a quarter filed, its shop report new until opened.
test("a report from two pins, read in Decide without touching the plan", async ({
  page,
  baseURL,
}) => {
  const errors: string[] = [];
  collectPageErrors(page, baseURL!, errors);

  // Two pins: the chart and the heatmap.
  await page.goto("/investigate?analytics-test=1");
  await page.getByTitle("Pin this chart below").click();
  await page.getByTitle("Pin this heatmap below").click();
  const board = page.getByRole("region", { name: "Pinned charts" });
  await expect(board.getByRole("article")).toHaveCount(2);

  // A report from Reports, with the chart (the board lists the newest pin, the heatmap, first).
  await page
    .getByRole("navigation", { name: "Main menu" })
    .getByRole("link", { name: /^Reports/ })
    .click();
  await expect(page.getByText("No reports yet.", { exact: false })).toBeVisible();
  await page.getByRole("link", { name: "New report" }).click();
  await page.getByRole("button", { name: "Save report" }).click();
  await expect(page.getByRole("alert")).toHaveText("Give the report a title.");
  await page.getByLabel("Title").fill("The quiet picks");
  await page.getByLabel("Summary (optional)").fill("Weekdays carry the quarter.");
  await page
    .getByRole("group", { name: "Add charts" })
    .getByRole("checkbox", { name: "Revenue by month" })
    .check();
  await page.getByLabel("Note (optional)").fill("Down in Q4.");
  await page.getByRole("button", { name: "Save report" }).click();
  await expect(page).toHaveURL(/\/reports\?report=/);
  await expect(page.getByRole("heading", { name: "The quiet picks" })).toBeVisible();
  await expect(page.getByText("Down in Q4.")).toBeVisible();

  // The heatmap joins it from its pin's Add to report.
  await page.goto("/investigate?analytics-test=1");
  await board.getByRole("button", { name: "Add to report: Revenue by weekday and month" }).click();
  await board.getByRole("link", { name: "The quiet picks" }).click();
  await expect(page).toHaveURL(/edit=.*&add=/);
  await expect(page.getByRole("button", { name: "Remove" })).toHaveCount(2);
  await page.getByRole("button", { name: "Save report" }).click();
  await expect(page).toHaveURL(/\/reports\?report=/);
  await page.goto("/reports");
  await expect(page.getByText("2 charts · edited Q1 2194")).toBeVisible();

  // Kept in the save: still there after a reload.
  await page.reload();
  await expect(page.getByRole("heading", { name: "The quiet picks" })).toBeVisible();

  // In Decide, beside the plan: a move picked, the report read, and the move still picked after.
  await page.goto("/decide?analytics-test=1");
  const move = page.getByRole("checkbox", { name: /^Weekday author nights/ });
  await move.check();
  const open = page.getByRole("button", { name: "Your reports (1)" });
  await open.click();
  const panel = page.getByRole("dialog", { name: "Your reports" });
  await panel.getByRole("button", { name: "The quiet picks" }).click();
  const read = page.getByRole("dialog", { name: "The quiet picks" });
  await expect(read.getByText("Weekdays carry the quarter.")).toBeVisible();
  await expect(read.getByRole("heading", { name: "Revenue by month" })).toBeVisible();
  await expect(read.getByRole("table", { name: "Revenue by weekday and month" })).toBeVisible();
  await expect(read.getByRole("textbox")).toHaveCount(0);
  // Leaving would clear the plan, so it asks; Escape stays.
  await read.getByRole("button", { name: "Edit in Reports" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Leaving Decide clears it.");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(read).toBeVisible();
  // Escape closes the panel; focus goes back to its button, and the plan is as it was.
  await page.keyboard.press("Escape");
  await expect(read).toHaveCount(0);
  await expect(open).toBeFocused();
  await expect(move).toBeChecked();

  // Filed, Q1's shop report is new until its card is opened.
  await page.getByRole("button", { name: "Submit plan", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page).toHaveURL(/\/result/, { timeout: 20_000 });
  const nav = page
    .getByRole("navigation", { name: "Main menu" })
    .getByRole("link", { name: /^Reports/ });
  await expect(nav).toHaveAccessibleName("Reports, 1 new");
  await nav.click();
  await expect(page.getByText("You have 1 new report.")).toBeVisible();
  await page.getByText("Q1 2194 report", { exact: false }).first().click();
  await expect(page.getByText("No new reports.")).toBeVisible();
  await expect(nav).not.toHaveAccessibleName(/new/);

  expect(errors).toEqual([]);
});
