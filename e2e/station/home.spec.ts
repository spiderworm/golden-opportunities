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

test('the station opens inside, then wherever the player left it', async ({ page }) => {
  await page.goto('/?analytics-test=1');
  const station = page.getByRole('region', { name: 'The station' });
  const control = station.getByRole('button', { name: /Go inside|Step outside/ });
  const still = station.getByText("can't show the station in 3D");
  await expect(control.or(still)).toBeVisible({ timeout: 15_000 });
  test.skip(await still.isVisible(), 'no WebGL 2 here: the still picture has no camera to move');

  // A first visit starts inside, and stays there.
  await expect(control).toHaveText('Step outside');
  await page.waitForTimeout(3_000);
  await expect(control).toHaveText('Step outside');

  await control.click();
  await expect(control).toHaveText('Go inside');
  await page.reload();
  await expect(control).toHaveText('Go inside', { timeout: 15_000 });

  await control.click();
  await page.reload();
  await expect(control).toHaveText('Step outside', { timeout: 15_000 });
});
