import { test, expect } from "../fixtures";

// Scatter plots (David, 3 Nov 2026: "two measures across one dimension"), with Plot's copy (#291).
test("two measures across a group can be a scatter plot, which says when it can't and pins as one", async ({
  page,
}) => {
  await page.goto("/investigate?analytics-test=1");
  const chart = page.locator('section[aria-labelledby="measure-chart-title"]');
  const scatter = chart.getByRole("button", { name: "Scatter plot" });

  // One measure: refused, with its reason.
  await expect(scatter).toHaveAttribute("aria-disabled", "true");
  await expect(scatter).toHaveAccessibleDescription("Choose a second measure for a scatter plot");

  // Two measures over months: still refused, since a line shows them in order.
  await page.goto("/investigate?analytics-test=1&measures=revenue,units");
  await expect(scatter).toHaveAccessibleDescription(
    "Break down by title, genre or another group for a scatter plot",
  );

  // Two measures by genre: a point per genre, revenue along the bottom and units up the side.
  await page.goto("/investigate?analytics-test=1&measures=revenue,units&by=genre");
  await expect(scatter).not.toHaveAttribute("aria-disabled", "true");
  await scatter.click();
  await expect(page).toHaveURL(/chart=scatter/);
  await expect(scatter).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("heading", { name: "Units sold against revenue, by genre" }),
  ).toBeVisible();
  const svg = chart.locator("svg:has(text)").first();
  await expect(svg).toContainText("Revenue ($)");
  await expect(svg).toContainText("Units sold");
  await expect(chart.getByRole("list", { name: "Measures" })).toHaveCount(0);

  // The table has the same columns either way.
  await chart.getByRole("button", { name: "Table" }).click();
  await expect(chart.getByRole("table")).toContainText("Units");
  await chart.getByRole("button", { name: "Table" }).click();

  // A pin is a scatter plot too.
  await chart.getByRole("button", { name: "Pin" }).click();
  const pin = page
    .getByRole("region", { name: "Pinned charts" })
    .getByRole("article", { name: "Units sold against revenue, by genre" });
  await expect(pin).toBeVisible();
  await expect(pin.locator("svg:has(text)").first()).toContainText("Revenue ($)");

  // A third measure turns it off, with its reason, and the link drops it.
  await page.goto(
    "/investigate?analytics-test=1&measures=revenue,units,orders&by=genre&chart=scatter",
  );
  await expect(scatter).toHaveAttribute("aria-disabled", "true");
  await expect(scatter).toHaveAccessibleDescription("A scatter plot shows two measures");
  await expect(
    page.getByRole("heading", { name: "Revenue, units sold and orders by genre" }),
  ).toBeVisible();
});
