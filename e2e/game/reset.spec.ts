import { test, expect, collectPageErrors } from '../fixtures';

// Reset game, from Settings (David, 2 Nov 2026): after an in-page confirm, a new game from January 1, 2194, with
// the old game's pins, conversation and station view forgotten in this browser, and the person's own settings kept.
test('Settings resets the game after a confirm step, from Q2 back to the January arrival', async ({ page, baseURL }) => {
  const errors: string[] = [];
  collectPageErrors(page, baseURL!, errors);
  await page.goto('/?analytics-test=1');
  const memo = page.getByRole('dialog', { name: 'Transmission from the Commerce Office' });
  await expect(memo).toContainText('THE NUMBERS HAVE GONE DOWN.');
  await memo.getByRole('button', { name: 'Later' }).click();
  await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible();

  // Play Q1, so there's a game to lose.
  await page.goto('/decide?analytics-test=1');
  await page.getByRole('button', { name: 'Submit plan', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(page).toHaveURL(/\/result(?:\?|$)/, { timeout: 20_000 });

  // What this browser keeps of the game, and something of the person's.
  await page.goto('/settings?analytics-test=1');
  await page.evaluate(() => {
    localStorage.setItem('orbital-books:pins:v1', '[]');
    localStorage.setItem('orbital-books.station.view', 'outside');
    localStorage.setItem('orbital.assistant.conversation.another-copy', '[]');
  });

  const section = page.getByRole('region', { name: 'Reset game' });
  const open = section.getByRole('button', { name: 'Reset game' });
  // Cancel has the focus when the confirm step opens; Escape closes it, and the focus goes back.
  await open.click();
  const confirm = section.getByRole('group', { name: "Reset the game? This can't be undone." });
  await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(confirm).toBeHidden();
  await expect(open).toBeFocused();
  // Cancel does the same.
  await open.click();
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(confirm).toBeHidden();
  await expect(open).toBeFocused();

  await open.click();
  await confirm.getByRole('button', { name: 'Reset and start over' }).click();
  await expect(page).toHaveURL(/\/(?:\?|$)/);
  // The arrival again: January's memo, and the standing order asks for Q1.
  await expect(memo).toContainText('THE NUMBERS HAVE GONE DOWN.');
  await memo.getByRole('button', { name: 'Later' }).click();
  await expect(page.getByRole('complementary', { name: 'Standing order' })).toContainText('Q1');
  expect(await page.evaluate(() => ({
    pins: localStorage.getItem('orbital-books:pins:v1'),
    view: localStorage.getItem('orbital-books.station.view'),
    other: localStorage.getItem('orbital.assistant.conversation.another-copy'),
  }))).toEqual({ pins: null, view: null, other: '[]' });
  expect(errors).toEqual([]);
});
