import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';

// Q2's plan (docs/design/q2.md section 5): a Book of the Month for April, May and June, or none, and up to
// one more move. The 2D scene, as a browser without WebGL 2 gets it, so the layout can be measured.

async function holdCourseInQ1(page: Page) {
  await page.goto('/decide?analytics-test=1');
  await expect(page.getByRole('heading', { name: 'PLAN FOR Q1 2194' })).toBeVisible();
  await page.getByRole('button', { name: 'Submit plan', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(page).toHaveURL(/\/result(?:\?|$)/, { timeout: 20_000 });
}

/** Where everything on the screen stands: the robots, the tags, the form and the floor. */
const layout = (page: Page) => page.evaluate(() => {
  const box = (el: Element) => { const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; };
  return {
    robots: [...document.querySelectorAll('[data-boss]')].map(box),
    tags: [...document.querySelectorAll('[data-tag]')].map(box),
    form: box(document.querySelector('fieldset')!),
  };
});

test('Q2: pick a book for each month, or none, and one more move, then play the quarter', async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      return type === 'webgl2' ? null : (getContext as (...args: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof getContext;
  });
  await holdCourseInQ1(page);

  await page.goto('/decide?analytics-test=1');
  await expect(page.getByRole('heading', { name: 'PLAN FOR Q2 2194' })).toBeVisible();
  await expect(page).toHaveTitle('Plan for Q2 2194 | Orbital Books');
  const calendar = page.getByRole('group', { name: 'BOOK OF THE MONTH' });
  const april = calendar.getByRole('button', { name: 'April No pick' });
  await expect(april).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Hold course: no picks and no other move.' })).toBeVisible();
  await page.waitForTimeout(800); // the scene's entrance
  const before = await layout(page);

  // April, by search and the keyboard: the list opens over the scene, and moves nothing.
  await april.click();
  const search = page.getByRole('combobox', { name: 'Find a title: April' });
  await expect(search).toBeFocused();
  expect(await layout(page)).toEqual(before);
  await search.fill('land water');
  await expect(page.getByRole('option', { name: 'Land Water Sky Space (hardcover), $48.00' })).toHaveAttribute('data-active', 'true');
  await search.press('Enter');
  const aprilPick = calendar.getByRole('button', { name: 'April Land Water Sky Space (hardcover), $48.00' });
  await expect(aprilPick).toBeFocused();
  expect(await layout(page)).toEqual(before);

  // May: April's book is in the list, but refused, with the month it's picked for.
  await calendar.getByRole('button', { name: 'May No pick' }).click();
  const maySearch = page.getByRole('combobox', { name: 'Find a title: May' });
  await maySearch.fill('Land Water');
  const taken = page.getByRole('option', { name: /^Land Water Sky Space \(hardcover\), \$48\.00 Already picked for April\.$/ });
  await expect(taken).toHaveAttribute('aria-disabled', 'true');
  // It's the active option; choosing it is refused, and the list stays open.
  await expect(taken).toHaveAttribute('data-active', 'true');
  await maySearch.press('Enter');
  await expect(maySearch).toBeVisible();
  await expect(calendar.getByRole('button', { name: 'May No pick' })).toBeVisible();
  // Two paperbacks of one title: told apart by price, each its own option.
  await maySearch.fill('Heliotrope');
  await expect(page.getByRole('option', { name: /^Heliotrope Pajamas \(paperback\)/ })).toHaveCount(2);
  const editions = await page.getByRole('option', { name: /^Heliotrope Pajamas \(/ }).count();
  const first = (await page.getByRole('option', { name: /^Heliotrope Pajamas \(paperback\)/ }).first().innerText()).trim();
  await page.getByRole('option', { name: /^Heliotrope Pajamas \(paperback\)/ }).first().click();
  await expect(calendar.getByRole('button', { name: `May ${first}` })).toBeVisible();

  // June: both of that title's editions are now taken; Escape leaves June with no pick.
  await calendar.getByRole('button', { name: 'June No pick' }).click();
  const juneSearch = page.getByRole('combobox', { name: 'Find a title: June' });
  await juneSearch.fill('Heliotrope');
  // Every edition of that book, whatever its format.
  await expect(page.getByRole('option', { name: /Already picked for May\.$/ })).toHaveCount(editions);
  await juneSearch.press('Escape');
  await expect(calendar.getByRole('button', { name: 'June No pick' })).toBeFocused();
  expect(await layout(page)).toEqual(before);

  // One more move, and only one.
  await page.getByRole('checkbox', { name: /^Weekday author nights/ }).check();
  await page.getByRole('checkbox', { name: /^Station-wide sale/ }).click();
  await expect(page.getByRole('checkbox', { name: /^Station-wide sale/ })).not.toBeChecked();
  await expect(page.getByRole('status').filter({ hasText: 'You can choose only one more move.' })).toBeVisible();
  expect(await layout(page)).toEqual(before);

  // The confirmation names the plan: each month's pick and the move.
  await page.getByRole('button', { name: 'Submit plan', exact: true }).click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm.getByRole('listitem')).toHaveText(['April: Land Water Sky Space (hardcover), $48.00', `May: ${first}`, 'Weekday author nights']);
  await confirm.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(page.getByText('April...', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/result(?:\?|$)/, { timeout: 20_000 });

  // Played: the game goes on (endless.md), so Decide now plans Q3, on Q2's form.
  await page.goto('/decide?analytics-test=1');
  await expect(page.getByRole('heading', { name: 'PLAN FOR Q3 2194' })).toBeVisible({ timeout: 20_000 });
});
