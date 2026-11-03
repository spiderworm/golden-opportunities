import { test, expect } from "../fixtures";

// Scatter plots (David, 3 Nov 2026: "two measures across one dimension"), with Plot's copy (#291). It's an item in
// the chart's Options menu (David, 3 Nov 2026), which says why it's off under it and what it does as its tooltip.
test("two measures across a group can be a scatter plot, which says when it can't and pins as one", async ({
  page,
}) => {
  await page.goto("/investigate?analytics-test=1");
  const chart = page.locator('section[aria-labelledby="measure-chart-title"]');
  const options = chart.getByRole("button", { name: /^Options/ });
  const scatter = chart.getByRole("menuitemcheckbox", { name: "Scatter plot" });

  // One measure: refused, with its reason.
  await options.click();
  await expect(scatter).toBeDisabled();
  await expect(scatter).toHaveAccessibleDescription("Choose a second measure for a scatter plot");

  // Two measures over months: still refused, since a line shows them in order.
  await page.goto("/investigate?analytics-test=1&measures=revenue,units");
  await options.click();
  await expect(scatter).toHaveAccessibleDescription(
    "Break down by title, genre or another group for a scatter plot",
  );

  // Two measures by genre: a point per genre, revenue along the bottom and units up the side.
  await page.goto("/investigate?analytics-test=1&measures=revenue,units&by=genre");
  await options.click();
  await expect(scatter).toBeEnabled();
  await expect(scatter).toHaveAttribute(
    "title",
    "Plot one measure against the other, one point per genre",
  );
  await scatter.click();
  await expect(page).toHaveURL(/chart=scatter/);
  await expect(scatter).toHaveAttribute("aria-checked", "true");
  // The button says something is on, so the chart's state isn't hidden in the closed menu.
  await page.keyboard.press("Escape");
  await expect(options).toHaveAccessibleName("Options, 1 on");
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
  await options.click();
  await expect(scatter).toBeDisabled();
  await expect(scatter).toHaveAccessibleDescription("A scatter plot shows two measures");
  await expect(
    page.getByRole("heading", { name: "Revenue, units sold and orders by genre" }),
  ).toBeVisible();
});
