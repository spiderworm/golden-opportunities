import { test, expect } from '../fixtures';

test('home page serves the station without browser errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const response = await page.goto('/?analytics-test=1');
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle('Orbital Books');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('main')).toContainText('Station systems coming online.');
  expect(errors).toEqual([]);
});
