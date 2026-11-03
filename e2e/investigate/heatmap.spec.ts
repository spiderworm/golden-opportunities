import { test, expect } from '../fixtures';

// The heatmap's own controls and its pin (David: "the same level of customization that we've given to charts,
// along with pinnability").
test('the heatmap chooses its measure and axes, filters by a cell, and pins as a heatmap', async ({ page }) => {
  await page.goto('/investigate?analytics-test=1');
  const card = page.locator('section[aria-labelledby="heatmap-title"]');
  await expect(page.getByRole('heading', { name: 'Revenue by weekday and month' })).toBeVisible();

  await card.getByRole('button', { name: /^Show/ }).click();
  await card.getByRole('radio', { name: 'Units sold', exact: true }).click();
  await card.getByRole('button', { name: /^Rows/ }).click();
  // Columns are months, so Rows doesn't offer them.
  await expect(card.getByRole('radio', { name: 'Month', exact: true })).toHaveCount(0);
  await card.getByRole('radio', { name: 'Genre', exact: true }).click();
  await card.getByRole('button', { name: /^Columns/ }).click();
  await card.getByRole('radio', { name: 'Price band', exact: true }).click();
  await expect(page).toHaveURL(/heat=units&heat_rows=genre&heat_cols=price_band/);
  await expect(page.getByRole('heading', { name: 'Units sold by genre and price band' })).toBeVisible();

  // A cell filters the screen to its genre and band.
  await card.getByRole('button', { name: /^Fiction, Under \$10: / }).click();
  await expect(page).toHaveURL(/genre=Fiction/);
  await expect(page).toHaveURL(/price_band=under/);
  await card.getByRole('button', { name: /^Fiction, Under \$10: / }).click();
  await expect(page).not.toHaveURL(/genre=Fiction/);

  // Pinned, it's a heatmap on the board.
  await card.getByRole('button', { name: 'Pin', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Pinned', exact: true })).toBeDisabled();
  const pin = page.getByRole('region', { name: 'Pinned charts' }).getByRole('article', { name: 'Units sold by genre and price band' });
  await expect(pin.getByRole('table', { name: 'Units sold by genre and price band' })).toBeVisible();
  await expect(pin.getByRole('cell').filter({ hasText: /\d/ }).first()).toBeVisible();
  await expect(pin.getByRole('button', { name: /^Fiction, / })).toHaveCount(0);
});
