import type { Page } from '@playwright/test';
import { test, expect, prepareContext } from '../fixtures';

async function ledgers(page: Page, query = '') {
  await page.goto(`/investigate?analytics-test=1&${query}`);
  await expect(page.getByRole('link', { name: 'Write the plan' })).toBeVisible();
}

// Bookmarkable title drilldowns: two qualifying months are a near-miss; three earn C.
const picks = [
  ['01', 'Thatchwork Cottage'],
  ['02', 'The Seawitch Sings'],
  ['03', 'Some Eggs or Something?'],
];
async function promotionMonths(page: Page, count: number) {
  for (const [month, title] of picks.slice(0, count)) {
    const params = new URLSearchParams({ measure: 'units', by: 'month', month, title, discount_rate: '15%' });
    await ledgers(page, params.toString());
    await expect(page.getByRole('region', { name: title, exact: true })).toBeVisible();
    await expect(page.getByText('No sales match these filters.', { exact: true })).toHaveCount(0);
  }
}

async function commitPlan(page: Page, moves: boolean) {
  await page.getByRole('link', { name: 'Write the plan' }).click();
  await expect(page.getByRole('heading', { name: 'PLAN FOR Q1 2194' })).toBeVisible();
  if (moves) {
    await page.getByRole('checkbox', { name: /^Re-pick Book of the Month/ }).check();
    await page.getByRole('checkbox', { name: /^Weekday author nights/ }).check();
  }
  await expect(page.getByRole('checkbox', { checked: true })).toHaveCount(moves ? 2 : 0);
  await page.getByRole('button', { name: 'Submit plan', exact: true }).click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toContainText(moves ? 'Weekday author nights' : 'Hold course: the schedule runs as it is.');
  if (moves) await expect(confirm).toContainText('Re-pick Book of the Month');
  await confirm.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(page).toHaveURL(/\/result(?:\?|$)/, { timeout: 20_000 });
  await expect(page.getByRole('heading', { name: 'Q1 2194: the results' })).toBeVisible();
}

async function checkReport(page: Page, holding: boolean) {
  const card = page.getByRole('region', { name: 'Report card', exact: true });
  const rows = card.locator('tbody tr');
  await expect(rows).toHaveCount(4);
  const scores = await rows.evaluateAll(rows => rows.map(row => Number(row.querySelectorAll('td')[3]!.textContent!.match(/^\d+/)![0])));
  const minimum = Math.min(...scores);
  const scorePanel = card.getByText('Overall score', { exact: true }).locator('..');
  await expect(scorePanel.locator(':scope > span').nth(1)).toHaveText(new RegExp(`^${minimum}[A-F][+−-]?$`));
  await expect(card.locator('blockquote').first()).toContainText(`YOUR SCORE: ${minimum}.`);
  const bosses: Record<string, string> = { Profit: 'Commerce Office', 'Readers served': 'Throughput Subcommittee', Happiness: "Readers' Guild survey drone", Culture: 'Ministry of Culture' };
  for (let i = 0; i < 4; i++) {
    const row = rows.nth(i);
    if (scores[i] === minimum) await expect(row).toHaveAttribute('data-binding', 'true');
    else await expect(row).not.toHaveAttribute('data-binding', 'true');
    if (scores[i] === minimum) {
      const name = (await row.locator('th').innerText()).replace(/Sets your score|Close behind/g, '').trim();
      await expect(card.locator('figcaption')).toContainText(bosses[name]);
    }
  }
  const rounded = card.getByText('Well-Rounded Shop: every measure scored 80 or more.', { exact: true });
  if (scores.every(score => score >= 80)) await expect(rounded).toBeVisible();
  else await expect(rounded).toHaveCount(0);
  const awards = card.getByRole('region', { name: 'Certificates', exact: true });
  const exceeds = await card.getByText('Exceeds Requirements', { exact: true }).count();
  await expect(awards.getByRole('listitem').filter({ hasText: /^Exceeds Requirements:/ })).toHaveCount(exceeds);
  if (!holding) {
    await expect(awards).toBeVisible();
    await expect(card.getByRole('columnheader', { name: 'If you had held course' })).toBeVisible();
  } else {
    await expect(card.getByRole('columnheader', { name: 'If you had held course' })).toHaveCount(0);
    await expect(page.getByText('Your plan was to hold course', { exact: true })).toHaveCount(3);
  }
  return card.innerText();
}

test('M1: discover, choose two moves, play; a separate save holds course with hints', async ({ page, browser, baseURL }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?analytics-test=1');
  await expect(page.getByRole('region', { name: 'The station' })).toBeVisible();
  await page.getByRole('button', { name: 'Notifications, 1 unread' }).click();
  await page.getByRole('link', { name: /Q4 revenue is down 41% on Q3/ }).click();
  await expect(page.getByRole('link', { name: 'Write the plan' })).toBeVisible();

  // A1: broad Q3/Q4 shape, A2: order size across both quarters.
  await page.getByRole('combobox', { name: /^Break down by/ }).selectOption('genre');
  await expect(page).toHaveURL(/by=genre/);
  await page.getByRole('button', { name: 'Compare quarters' }).click();
  await expect(page.getByRole('button', { name: 'Compare quarters' })).toHaveAttribute('aria-pressed', 'true');
  await ledgers(page, 'measure=avg_order_value&by=quarter');
  // B is deliberately selected; the default heatmap must never be relied upon.
  await ledgers(page, 'by=weekday&compare=quarter');
  await expect(page.getByRole('combobox', { name: /^Break down by/ })).toHaveValue('weekday');
  await promotionMonths(page, 3);
  await commitPlan(page, true);
  const firstReport = await checkReport(page, false);
  const found = page.getByRole('region', { name: 'What you found' });
  await expect(found.locator('li[data-found="true"]')).toHaveCount(3);
  await expect(found).toContainText('The whole store slowed.');
  await expect(found).toContainText('Weekdays emptied; weekends held.');
  await expect(found).toContainText("Nonfiction's rise was one discounted title");

  const other = await browser.newContext({ baseURL, serviceWorkers: 'block' });
  await prepareContext(other, baseURL!);
  try {
    const second = await other.newPage();
    second.on('pageerror', error => errors.push(error.message));
    await second.goto('/result?analytics-test=1');
    await expect(second).toHaveURL(/\/decide/); // first player's committed plan is not shared
    const id = (await page.context().cookies()).find(c => c.name === 'orbital_save')?.value;
    const otherId = (await other.cookies()).find(c => c.name === 'orbital_save')?.value;
    expect(id).toBeTruthy(); expect(otherId).toBeTruthy(); expect(otherId).not.toBe(id);
    await promotionMonths(second, 2);
    await commitPlan(second, false);
    await checkReport(second, true);
    const hints = second.getByRole('region', { name: 'What you found' });
    await expect(hints.locator('li[data-found="true"]')).toHaveCount(0);
    await expect(hints.getByText('Not found', { exact: true })).toHaveCount(3);
    await expect(hints).toContainText('Compare Q3 and Q4 by genre');
    await expect(hints).toContainText('Break Q3 and Q4 down by weekday.');
    await expect(hints).toContainText('Look closer at the one genre that grew');
    await second.reload();
    await expect(hints.getByText('Not found', { exact: true })).toHaveCount(3);
  } finally { await other.close(); }
  await page.reload();
  await expect(page.getByRole('region', { name: 'Report card', exact: true })).toHaveText(firstReport, { useInnerText: true });
  await expect(found.locator('li[data-found="true"]')).toHaveCount(3);
  expect(errors).toEqual([]);
});
