import { test, expect } from '../fixtures';

test('home page serves the station without browser errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const response = await page.goto('/?analytics-test=1');
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle('Orbital Books');
  await page.getByRole('dialog', { name: 'Transmission from the Commerce Office' }).getByRole('button', { name: 'Later' }).click();
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
  await page.getByRole('dialog', { name: 'Transmission from the Commerce Office' }).getByRole('button', { name: 'Later' }).click();
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

test('coming back to the station shows its last frame until the scene draws again', async ({ page }) => {
  // Counts the scene's draw calls, so the page can tell when the new canvas has drawn.
  await page.addInitScript(() => {
    const gl = WebGL2RenderingContext.prototype;
    for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced'] as const) {
      const draw = gl[name] as (...args: unknown[]) => void;
      (gl as unknown as Record<string, unknown>)[name] = function (this: WebGL2RenderingContext, ...args: unknown[]) {
        (window as unknown as { draws: number }).draws = ((window as unknown as { draws?: number }).draws ?? 0) + 1;
        return draw.apply(this, args);
      };
    }
  });
  await page.goto('/?analytics-test=1');
  await page.getByRole('dialog', { name: 'Transmission from the Commerce Office' }).getByRole('button', { name: 'Later' }).click();
  const station = page.getByRole('region', { name: 'The station' });
  const control = station.getByRole('button', { name: /Go inside|Step outside/ });
  const still = station.getByText("can't show the station in 3D");
  await expect(control.or(still)).toBeVisible({ timeout: 15_000 });
  test.skip(await still.isVisible(), 'no WebGL 2 here: no scene to hold a frame of');
  // The models load after the control appears; a frame is only kept once the scene has drawn them.
  await expect(station).toHaveAttribute('data-drawn', 'true', { timeout: 30_000 });

  await page.getByRole('link', { name: 'Investigate' }).click();
  await expect(station).toHaveCount(0);
  // Every animation frame from the click until the new scene has drawn: what's in the station's place?
  const frames = await page.evaluate(async () => {
    const w = window as unknown as { draws: number };
    w.draws = 0;
    const seen: string[] = [];
    [...document.querySelectorAll('a')].find(a => a.textContent?.trim() === 'Station')!.click();
    const started = performance.now();
    await new Promise<void>(done => {
      const look = () => {
        const section = document.querySelector('section[aria-label="The station"]');
        if (section) seen.push(section.querySelector('img') ? 'held' : w.draws > 0 ? 'drawn' : 'empty');
        if (seen.at(-1) === 'drawn' || performance.now() - started > 20_000) done();
        else requestAnimationFrame(look);
      };
      look();
    });
    return seen;
  });
  expect(frames.at(-1)).toBe('drawn');
  expect(frames.filter(frame => frame === 'empty')).toEqual([]);
  expect(frames).toContain('held');
  await expect(station.locator('img')).toHaveCount(0);
});

test('on first arrival the Commerce Office sends its memo once; the standing order keeps it until the plan is in', async ({ page }) => {
  await page.goto('/?analytics-test=1');
  const transmission = page.getByRole('dialog', { name: 'Transmission from the Commerce Office' });
  await expect(transmission).toBeVisible();
  await expect(transmission).toContainText('Fourth-quarter revenue: $161,525. Third quarter: $274,036. Down 41%.');
  await expect(transmission.getByRole('link', { name: 'Open the ledgers' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(transmission).toBeHidden();
  // Seen once, it stays seen: the bell's alert is read...
  await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible();

  // ...it doesn't come back, and the order stays in its strip.
  await page.reload();
  const order = page.getByRole('complementary', { name: 'Standing order' });
  await expect(order).toBeVisible();
  await page.waitForTimeout(500);
  await expect(transmission).toBeHidden();

  await order.getByRole('button', { name: 'Read the memo' }).click();
  await expect(transmission).toBeVisible();
  await transmission.getByRole('link', { name: 'Open the ledgers' }).click();
  await expect(page).toHaveURL(/\/investigate/);
  await expect(transmission).toBeHidden();
  await expect(order.getByRole('link', { name: 'Open the ledgers' })).toHaveCount(0);
  await expect(order.getByRole('button', { name: 'Read the memo' })).toBeVisible();
});
