import { test, expect } from '../fixtures';

// Prices in Investigate (David: "Players should see price, yes"; Frank's #179, Chart's #249): price band, list price
// and edition as breakdowns and filters.
test('breaks down by price band and list price in price order, and filters by band and exact price', async ({ page }) => {
  await page.goto('/investigate?analytics-test=1');
  const chart = page.locator('section[aria-labelledby="measure-chart-title"]');
  const bar = page.getByRole('group', { name: 'Filters' });
  const figures = page.getByRole('region', { name: 'Key figures' });
  const everything = (await figures.textContent())!;

  await chart.getByRole('button', { name: /^Break down by/ }).click();
  await chart.getByRole('radio', { name: 'Price band', exact: true }).click();
  await expect(page).toHaveURL(/by=price_band/);
  await expect(page.getByRole('heading', { name: 'Revenue by price band' })).toBeVisible();

  // The Table view lists the bands cheapest first, as the chart draws them.
  await chart.getByRole('button', { name: 'Table' }).click();
  const bands = await chart.getByRole('table').getByRole('row').allTextContents();
  const order = ['under $10', '$10 to $19.99', '$20 to $29.99', '$30 and up'].filter((band) => bands.some((row) => row.includes(band)));
  expect(order.length).toBeGreaterThan(1);
  expect(order).toEqual([...order].sort((a, b) => bands.findIndex((r) => r.includes(a)) - bands.findIndex((r) => r.includes(b))));
  await chart.getByRole('button', { name: 'Table' }).click();

  // Price band from the bar: a band filters everything.
  await bar.getByRole('button', { name: 'Add a filter' }).click();
  await page.getByRole('group', { name: 'Filters on the bar' }).getByRole('checkbox', { name: 'Price band' }).check();
  await page.keyboard.press('Escape');
  await bar.getByRole('button', { name: 'Price band Any price' }).click();
  await page.getByRole('group', { name: 'Price band' }).getByRole('checkbox', { name: '$10 to $19.99' }).click();
  await expect(page).toHaveURL(/price_band=%2410\+to\+%2419\.99/);
  await expect(bar.getByRole('button', { name: 'Price band $10 to $19.99' })).toBeVisible();
  await expect(figures).not.toHaveText(everything);
  await page.keyboard.press('Escape');

  // An exact list price from a drilldown is a chip beside the band menu, and its x clears it. The price is one the
  // data has: the first row of the list-price breakdown, which is the cheapest.
  await page.goto('/investigate?analytics-test=1&by=list_price');
  await expect(page.getByRole('heading', { name: 'Revenue by list price' })).toBeVisible();
  await chart.getByRole('button', { name: 'Table' }).click();
  const price = (await chart.getByRole('table').getByRole('row').nth(1).getByRole('cell').first().textContent())!.trim();
  expect(price).toMatch(/^\$\d+\.\d{2}$/);
  await page.goto(`/investigate?analytics-test=1&by=list_price&list_price=${encodeURIComponent(price)}`);
  const chips = page.getByRole('list', { name: 'Other filters' });
  await expect(chips).toContainText(`List price${price}`);
  await chips.getByRole('button', { name: `Remove List price ${price}` }).click();
  await expect(page).not.toHaveURL(/list_price=/);
});

test('breaks down by edition as ranked bars, and an edition filter comes from the chart', async ({ page }) => {
  await page.goto('/investigate?analytics-test=1&by=edition');
  await expect(page.getByRole('heading', { name: 'Revenue by edition' })).toBeVisible();
  const chart = page.locator('section[aria-labelledby="measure-chart-title"]');
  await expect(chart.getByRole('button', { name: 'Compare quarters' })).toBeDisabled();
  await expect(chart.getByRole('button', { name: /^Show all \d+ editions$/ })).toBeVisible();

  const bar = page.getByRole('group', { name: 'Filters' });
  await bar.getByRole('button', { name: 'Add a filter' }).click();
  await page.getByRole('group', { name: 'Filters on the bar' }).getByRole('checkbox', { name: 'Edition' }).check();
  await page.keyboard.press('Escape');
  await bar.getByRole('button', { name: 'Edition Any edition' }).click();
  await expect(page.getByRole('group', { name: 'Edition' })).toContainText('Choose an edition from a chart broken down by Edition.');
});
