import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';

/**
 * Page errors WebKit raises for a fetch that a navigation cut off, measured on this loop (31 Oct 2026, Goldy's
 * call): excused on WebKit only, each matched by its message and URL, until its owner catches aborted loads.
 * Anything else, in any browser, still fails the test. The station's entries went with Orbit's #161.
 */
const ABORTED_ON_WEBKIT: { owner: string; pattern: RegExp }[] = [
  // React Router's own route discovery for the result's Play again form (action /game/new), leaving /result
  // before it answers. No clean fix known; it stays unless someone finds one.
  { owner: 'React Router', pattern: /^\/127\.0\.0\.1:\d+\/__manifest\?paths=[^ ]*%2Fgame%2Fnew[^ ]* due to access control checks\.$/ },
];

/**
 * Before leaving a page: let what it's fetching arrive. WebKit reports a fetch cut off by navigation as an
 * uncaught page error, as React Router's route discovery for a form's action does.
 */
const settle = (page: Page) => page.waitForLoadState('networkidle');

/** A measure's name, as the memo lists ties: "Profit and Culture". */
const MEASURES = '(?:Profit|Readers served|Happiness|Culture)';

/** The report card's overall score and grade, as shown ("80", "B−"). */
async function overall(page: Page): Promise<[number, string]> {
  const line = page.getByRole('region', { name: 'Report card', exact: true }).getByText('Overall score', { exact: true }).locator('..');
  const [, score, grade] = (await line.locator(':scope > span').nth(1).innerText()).match(/^(\d+)(\S+)$/)!;
  return [Number(score), grade!];
}

// The whole game (docs/design/q2.md): Q1, Continue to Q2, Q2's memo quoting Q1, Q2's plan with a pick,
// Q2's result and the half-year review, Q1's result still there, then Play again from January 1.
test('Q1, then Q2 with a pick, then the half-year review, then Play again', async ({ page, browserName }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?analytics-test=1');
  const q1Memo = page.getByRole('dialog', { name: 'Transmission from the Commerce Office' });
  await expect(q1Memo).toContainText('THE NUMBERS HAVE GONE DOWN.');
  await q1Memo.getByRole('button', { name: 'Later' }).click();
  // The seen flag lands, and the shell reloads with the bell read, before we go anywhere (WebKit races it).
  await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible();

  // Q1: hold course.
  await settle(page);
  await page.goto('/decide?analytics-test=1');
  await expect(page.getByRole('heading', { name: 'PLAN FOR Q1 2194' })).toBeVisible();
  await settle(page);
  await page.getByRole('button', { name: 'Submit plan', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(page).toHaveURL(/\/result(?:\?|$)/, { timeout: 20_000 });
  await expect(page.getByRole('heading', { name: 'Q1 2194: the results' })).toBeVisible();
  const [score, grade] = await overall(page);
  await expect(page.getByRole('heading', { name: 'Half-year review' })).toHaveCount(0);

  await page.getByRole('link', { name: 'Continue to Q2', exact: true }).click();
  await expect(page).toHaveURL(/\/(?:\?|$)/);
  const memo = page.getByRole('dialog', { name: 'Transmission from the Commerce Office' });
  await expect(memo).toContainText('THE FIRST QUARTER HAS BEEN FILED.');
  await expect(memo).toContainText('April 1, 2194');
  await expect(memo).toContainText(new RegExp(`First-quarter overall score: ${score} \\(${grade}\\)\\. (Lowest measure: ${MEASURES}(?:(?:, | and )${MEASURES})*\\.|Every measure met its goal\\.)`));
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

  // The memo doesn't play again on the next arrival.
  await settle(page);
  await page.reload();
  // Once the station is drawn, the memo would be open if it were going to play.
  const station = page.getByRole('region', { name: 'The station' });
  await expect(page.locator('section[aria-label="The station"][data-drawn]').or(station.getByText(/so here it is from the shuttle\.$/))).toBeVisible({ timeout: 30_000 });
  await settle(page);
  await expect(memo).toBeHidden();

  // F: the ledgers open by quarter once Q1 is played. That F is found is checked on Q2's result.
  await settle(page);
  await page.goto('/investigate?analytics-test=1&measure=revenue&by=quarter');
  await expect(page.getByRole('link', { name: 'Write the plan' })).toBeVisible();

  // Q2's plan: a quiet, pricey April pick, and author nights.
  await settle(page);
  await page.goto('/decide?analytics-test=1');
  await expect(page.getByRole('heading', { name: 'PLAN FOR Q2 2194' })).toBeVisible();
  // The bosses' scene loads its models first: typing before then can lose the picker's focus, and Submit
  // would cut a model's fetch off.
  await settle(page);
  await page.getByRole('button', { name: /^April/ }).click();
  await page.getByRole('combobox', { name: 'Find a title: April' }).fill('Land Water');
  const pick = 'Land Water Sky Space (hardcover), $48.00';
  await page.getByRole('option', { name: pick }).click();
  await expect(page.getByRole('button', { name: /^April/ })).toContainText(pick);
  await page.getByRole('checkbox', { name: /^Weekday author nights/ }).check();
  await page.getByRole('button', { name: 'Submit plan', exact: true }).click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toContainText(`April: ${pick}`);
  await expect(confirm).toContainText('Weekday author nights');
  await confirm.getByRole('button', { name: 'Submit', exact: true }).click();

  // Q2's result: Q1's screen, for Q2.
  await expect(page).toHaveURL(/\/result(?:\?|$)/, { timeout: 20_000 });
  await expect(page.getByRole('heading', { name: 'Q2 2194: the results' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Q2 2193 + new volume' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Lines' })).toContainText('Q1 2194 (for reference)');
  await expect(page.getByRole('region', { name: 'What happened' })).toContainText('Land Water Sky Space');
  await expect(page.getByRole('link', { name: 'Continue to Q2' })).toHaveCount(0);
  const found = page.getByRole('region', { name: 'What you found' });
  await expect(found.locator('li[data-found="true"]')).toContainText(["You compared your first quarter with last year's."]);
  await expect(found).not.toContainText('Weekdays emptied');
  const [q2Score, q2Grade] = await overall(page);

  // The half-year review: both quarters' scores, and their mean, rounded half up.
  const review = page.getByRole('region', { name: 'Half-year review' });
  await expect(review.getByRole('row', { name: /^Q1 2194/ })).toContainText(`${score} (${grade})`);
  await expect(review.getByRole('row', { name: /^Q2 2194/ })).toContainText(`${q2Score} (${q2Grade})`);
  const half = Math.floor((score + q2Score) / 2 + 0.5);
  await expect(review).toContainText(new RegExp(`Half-year score: ${half} \\(`));
  await expect(review).toContainText(`HALF-YEAR SCORE: ${half}.`);
  await expect(review).toContainText("That's the end of the first half of 2194. Thanks for minding the shop.");
  await expect(review.getByRole('link', { name: 'Back to the ledgers' })).toBeVisible();

  // Q1's result is still there, as it was: no way on, and no review.
  await settle(page);
  await page.goto('/result?analytics-test=1&quarter=2194-Q1');
  await expect(page.getByRole('heading', { name: 'Q1 2194: the results' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Continue to Q2' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Half-year review' })).toHaveCount(0);

  // Play again: a new save from January 1, with Q1's memo.
  await settle(page);
  await page.goto('/result?analytics-test=1');
  const before = (await page.context().cookies()).find(c => c.name === 'orbital_save')?.value;
  await page.getByRole('region', { name: 'Half-year review' }).getByRole('button', { name: 'Play again' }).click();
  await expect(page).toHaveURL(/\/(?:\?|$)/);
  await expect(page.getByRole('dialog', { name: 'Transmission from the Commerce Office' })).toContainText('THE NUMBERS HAVE GONE DOWN.');
  await expect(page.locator('time')).toHaveText('1 Jan 2194');
  const after = (await page.context().cookies()).find(c => c.name === 'orbital_save')?.value;
  expect(after).toBeTruthy();
  expect(after).not.toBe(before);
  const excused = (message: string) => browserName === 'webkit' && ABORTED_ON_WEBKIT.some(a => a.pattern.test(message));
  expect(errors.filter(message => !excused(message))).toEqual([]);
});
