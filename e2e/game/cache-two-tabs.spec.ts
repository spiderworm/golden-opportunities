import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';

// The browser's query cache with two tabs (Frank's and Audit's findings on #191): a plan committed in one tab
// moves the data on, and the other tab must stop serving the old quarter's views as soon as the server tells it.

async function playQ1(page: Page) {
  await page.goto('/decide?analytics-test=1');
  await expect(page.getByRole('heading', { name: 'PLAN FOR Q1 2194' })).toBeVisible();
  await page.getByRole('button', { name: 'Submit plan', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(page).toHaveURL(/\/result(?:\?|$)/, { timeout: 30_000 });
}

test("a tab overtaken by another tab's plan stops serving the old quarter's views", async ({ page, context }) => {
  test.setTimeout(120_000);
  const filters = page.getByRole('group', { name: 'Filters' });
  const genre = filters.getByRole('button', { name: /^Genre/ });
  const fiction = page.getByRole('checkbox', { name: 'Fiction', exact: true });
  const table = page.getByRole('table').first();
  const loads: string[] = [];
  page.on('request', (r) => { if (/\/investigate\.data/.test(r.url()) && /investigate%2Froute/.test(r.url())) loads.push(r.url()); });

  // Tab A: revenue by quarter, as a table; then Fiction and back, so the first view comes from the cache.
  await page.goto('/investigate?analytics-test=1&by=quarter');
  await page.getByRole('button', { name: 'Table', exact: true }).click();
  await expect(table).toContainText('Q4 2193');
  await expect(table).not.toContainText('Q1 2194');
  await genre.click();
  await fiction.click();
  await expect(page).toHaveURL(/genre=Fiction/);
  await fiction.click();
  await expect(page).not.toHaveURL(/genre=Fiction/);
  await page.keyboard.press('Escape');
  const before = loads.length;
  await expect(table).not.toContainText('Q1 2194');

  // Tab B, the same game: Q1 is played.
  const other = await context.newPage();
  await playQ1(other);
  await other.close();

  // Back in tab A: a new question goes to the server, which answers under Q1's new version. From then on, no
  // view from before the commit is served: back to every genre, the table has Q1 2194.
  await page.bringToFront();
  await genre.click();
  await page.getByRole('checkbox', { name: 'Mystery', exact: true }).click();
  await expect(page).toHaveURL(/genre=Mystery/);
  const backToAll = loads.length;
  await page.getByRole('checkbox', { name: 'Mystery', exact: true }).click();
  await expect(page).not.toHaveURL(/genre=/);
  await expect(page.locator('[data-refreshing]')).toHaveCount(0);
  // Every genre was cached before the commit: it must be asked for again, not served from Q1's version.
  expect(loads.length).toBeGreaterThan(backToAll);
  await expect(table).toContainText('Q1 2194', { timeout: 5_000 });
  expect(loads.length).toBeGreaterThan(before);
});
