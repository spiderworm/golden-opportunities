import { test, expect } from '../fixtures';

test('home page serves the station without browser errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const response = await page.goto('/?analytics-test=1');
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle('Orbital Books');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const station = page.getByRole('region', { name: 'The station' });
  await expect(station).toContainText('Ring C, Berth 14');
  // With WebGL 2 the 3D scene offers to move the camera; without it, the still picture says why.
  await expect(
    station.getByRole('button', { name: /Go inside|Step outside/ }).or(station.getByText("can't show the station in 3D")),
  ).toBeVisible({ timeout: 15_000 });
  expect(errors).toEqual([]);
});

test('other screens never load the 3D station', async ({ page }) => {
  const scripts: string[] = [];
  page.on('request', request => scripts.push(new URL(request.url()).pathname));
  await page.goto('/investigate?analytics-test=1');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(scripts.filter(path => /StationScene|\/three\/|@react-three/.test(path))).toEqual([]);
});
