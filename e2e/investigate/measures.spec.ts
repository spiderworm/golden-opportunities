import { test, expect } from '../fixtures';

// Several measures in one chart (David, 2 Nov 2026): up to three, on at most two units, one axis each.
test('measures are added from Show, a third unit is refused with its reason, and the legend and pins keep them', async ({ page }) => {
  await page.goto('/investigate?analytics-test=1');
  // The card's name is its title, which changes with the measures.
  const chart = page.locator('section[aria-labelledby="measure-chart-title"]');
  const show = chart.getByRole('button', { name: /^Show (?!all)/ });
  const list = chart.getByRole('group', { name: 'Show' });

  await show.click();
  await list.getByRole('checkbox', { name: 'Units sold' }).check();
  await expect(page).toHaveURL(/measures=revenue%2Cunits/);
  await expect(page.getByRole('heading', { name: 'Revenue and units sold by month' })).toBeVisible();

  // Dollars and counts are on the chart: a percent, or an average in dollars, would need a third axis.
  const discount = list.getByRole('checkbox', { name: /^Average discount/ });
  await expect(discount).toBeDisabled();
  await expect(list).toContainText('Two axes at most');
  await expect(list.getByRole('checkbox', { name: /^Average order value/ })).toBeDisabled();
  await list.getByRole('checkbox', { name: 'Orders', exact: true }).check();
  await expect(page).toHaveURL(/measures=revenue%2Cunits%2Corders/);
  await expect(list.getByRole('checkbox', { name: /^Average order value/ })).toBeDisabled();
  await expect(list).toContainText('Three at most');
  await page.keyboard.press('Escape');
  await expect(list).toBeHidden();

  // Two axes, each named for its measures.
  // The chart's SVG, not an icon's: the one with text in it.
  const svg = chart.locator('svg:has(text)').first();
  await expect(svg).toContainText('Revenue');
  await expect(svg).toContainText('Units sold · Orders');

  // The legend turns a series off and on.
  const legend = page.getByRole('list', { name: 'Measures' });
  const units = legend.getByRole('button', { name: 'Units sold' });
  await units.click();
  await expect(units).toHaveAttribute('aria-pressed', 'false');
  await units.click();
  await expect(units).toHaveAttribute('aria-pressed', 'true');

  // Compare quarters can't join several measures.
  await chart.getByRole('button', { name: /^Break down by/ }).click();
  await chart.getByRole('radio', { name: 'Genre', exact: true }).click();
  await expect(page).toHaveURL(/by=genre/);
  await expect(chart.getByRole('button', { name: 'Compare quarters' })).toBeDisabled();

  // A pin keeps all three.
  await chart.getByRole('button', { name: 'Pin' }).click();
  const pinned = page.getByRole('region', { name: 'Pinned charts' });
  const pin = pinned.getByRole('article', { name: 'Revenue, units sold and orders by genre' });
  await expect(pin).toBeVisible();
  await expect(pin.getByRole('list', { name: 'Measures' })).toContainText('Orders');

  // An old single-measure link still opens as it did.
  await page.goto('/investigate?analytics-test=1&measure=units');
  await expect(page.getByRole('heading', { name: 'Units sold by month' })).toBeVisible();
  // The pin above still has its own legend: the chart's is gone.
  await expect(chart.getByRole('list', { name: 'Measures' })).toHaveCount(0);
});
