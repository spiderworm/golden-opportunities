import { test, expect } from '../fixtures';

// After Q1: the result offers Q2, and the station delivers Q2's memo (docs/design/q2.md, sections 2 and 7).
// Q2's own result and the half-year review join this once Decide takes a Q2 plan.
test('after Q1, Continue to Q2 opens the station on April 1 with the Q2 memo, quoting Q1', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?analytics-test=1');
  const q1Memo = page.getByRole('dialog', { name: 'Transmission from the Commerce Office' });
  await expect(q1Memo).toContainText('THE NUMBERS HAVE GONE DOWN.');
  await q1Memo.getByRole('button', { name: 'Later' }).click();
  // The seen flag lands, and the shell reloads with the bell read, before we go anywhere (WebKit races it).
  await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible();

  // Q1: hold course.
  await page.goto('/decide?analytics-test=1');
  await expect(page.getByRole('heading', { name: 'PLAN FOR Q1 2194' })).toBeVisible();
  await page.getByRole('button', { name: 'Submit plan', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(page).toHaveURL(/\/result(?:\?|$)/, { timeout: 20_000 });
  await expect(page.getByRole('heading', { name: 'Q1 2194: the results' })).toBeVisible();
  const scoreLine = page.getByRole('region', { name: 'Report card', exact: true }).getByText('Overall score', { exact: true }).locator('..');
  const [score, grade] = (await scoreLine.locator(':scope > span').nth(1).innerText()).match(/^(\d+)(\S+)$/)!.slice(1);
  await expect(page.getByRole('heading', { name: 'Half-year review' })).toHaveCount(0);

  await page.getByRole('link', { name: 'Continue to Q2', exact: true }).click();
  await expect(page).toHaveURL(/\/(?:\?|$)/);
  const memo = page.getByRole('dialog', { name: 'Transmission from the Commerce Office' });
  await expect(memo).toContainText('THE FIRST QUARTER HAS BEEN FILED.');
  await expect(memo).toContainText('April 1, 2194');
  await expect(memo).toContainText(new RegExp(`First-quarter overall score: ${score} \\(${grade}\\)\\. (Lowest measure: [A-Z][a-z ,]+\\.|Every measure met its goal\\.)`));
  await expect(memo).toContainText('Your ledgers now include Q1 2194, and Dewey can help you read them there.');
  await memo.getByRole('button', { name: 'Later' }).click();
  await expect(memo).toBeHidden();
  await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible();

  // The strip asks for Q2's picks; the bell has both memos, newest first, both read now.
  await expect(page.getByRole('complementary', { name: 'Standing order' })).toContainText('Q2');
  await expect(page.getByRole('complementary', { name: 'Standing order' })).not.toContainText('41%');
  await page.getByRole('button', { name: 'Notifications', exact: true }).click();
  const titles = page.locator('[class*="itemTitle"]');
  await expect(titles).toHaveText(['The Q2 Book of the Month calendar is empty', 'Q4 revenue is down 41% on Q3']);

  // The memo doesn't play again on the next arrival. Reload once the station has loaded: a reload while its
  // navigation wasm is still arriving makes WebKit report the aborted fetch as a page error.
  const station = page.getByRole('region', { name: 'The station' });
  await expect(page.locator('section[aria-label="The station"][data-drawn]').or(station.getByText(/so here it is from the shuttle\.$/))).toBeVisible({ timeout: 30_000 });
  await page.reload();
  await expect(page.getByRole('region', { name: 'The station' })).toBeVisible();
  await page.waitForTimeout(500);
  await expect(memo).toBeHidden();
  expect(errors).toEqual([]);
});
