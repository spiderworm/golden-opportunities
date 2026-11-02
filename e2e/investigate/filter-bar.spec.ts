import { test, expect } from '../fixtures';

// Investigate's filter bar (David, 2 Nov 2026): only the filters the player added, each with an "x", and an
// "Add a filter" list that puts them on the bar or takes them off.
test('filters are added from the list, filter nothing until chosen, and come off with their values', async ({ page }) => {
  const loads: string[] = [];
  // Investigate's own loader: a request for every route (no _routes), or one that names it.
  page.on('request', (r) => {
    const url = r.url();
    if (/\/investigate\.data/.test(url) && (!url.includes('_routes=') || url.includes('investigate%2Froute'))) loads.push(url);
  });
  await page.goto('/investigate?analytics-test=1');
  const bar = page.getByRole('group', { name: 'Filters' });
  const add = bar.getByRole('button', { name: 'Add a filter' });
  const figures = page.getByRole('region', { name: 'Key figures' });
  await expect(add).toBeVisible();
  await expect(bar.getByRole('button', { name: /^Genre/ })).toHaveCount(0);
  const everything = (await figures.textContent())!;

  // Added from the list, with keyboard: Genre joins the bar, filtering nothing yet, and no data is asked for.
  await add.focus();
  await page.keyboard.press('Enter');
  const list = page.getByRole('group', { name: 'Filters on the bar' });
  await list.getByRole('checkbox', { name: 'Genre' }).check();
  await expect(page).toHaveURL(/show=genre/);
  await list.getByRole('checkbox', { name: 'Awards' }).check();
  await expect(page).toHaveURL(/show=genre&show=awards/);
  await page.keyboard.press('Escape');
  await expect(list).toBeHidden();
  await expect(add).toBeFocused();
  await expect(bar.getByRole('button', { name: 'Genre All genres' })).toBeVisible();
  await expect(figures).toHaveText(everything);
  await page.waitForTimeout(300);
  const before = loads.length;

  // Choosing a value filters; the x takes the filter off and clears its value, and the focus goes to Add a filter.
  await bar.getByRole('button', { name: /^Genre/ }).click();
  await page.getByRole('checkbox', { name: 'Fiction', exact: true }).click();
  await expect(page).toHaveURL(/genre=Fiction/);
  await expect(figures).not.toHaveText(everything);
  await page.keyboard.press('Escape');
  await bar.getByRole('button', { name: 'Remove the Genre filter' }).click();
  await expect(page).not.toHaveURL(/genre=Fiction|show=genre/);
  await expect(bar.getByRole('button', { name: /^Genre/ })).toHaveCount(0);
  await expect(add).toBeFocused();
  await expect(figures).toHaveText(everything);
  // Only choosing and clearing Fiction asked for data, not adding or the empty filters.
  expect(loads.length - before).toBe(2);

  // Awards is still on the bar, empty; unchecking it in the list takes it off.
  await add.click();
  await list.getByRole('checkbox', { name: 'Awards' }).uncheck();
  await expect(bar.getByRole('button', { name: /^Awards/ })).toHaveCount(0);
});

test('a drilldown puts its filter on the bar, and Clear filters takes everything off', async ({ page }) => {
  await page.goto('/investigate?analytics-test=1&weekday=Monday&month=2193-12&show=quarter');
  const bar = page.getByRole('group', { name: 'Filters' });
  await expect(bar.getByRole('button', { name: 'Month Dec 2193' })).toBeVisible();
  await expect(bar.getByRole('button', { name: 'Weekday Monday' })).toBeVisible();
  await expect(bar.getByRole('button', { name: 'Quarter All quarters' })).toBeVisible();
  await bar.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page).not.toHaveURL(/weekday|month|show/);
  await expect(bar.getByRole('button', { name: /^(Month|Weekday|Quarter)/ })).toHaveCount(0);
});
