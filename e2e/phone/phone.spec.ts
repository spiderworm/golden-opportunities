import { test, expect } from '../fixtures';

const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
const LINE = 'WHAT IS THIS? A COMPUTER FOR ANTS?';
const FACT = 'Orbital Books needs a laptop or desktop computer. Open this page on one to play.';

test.describe('on a phone', () => {
  test.use(PHONE);

  test('a robot grabs the phone and says it needs a computer, instead of the game', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'only Chromium takes touch and a coarse pointer from isMobile');
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/?analytics-test=1');
    await expect(page.getByRole('img', { name: 'A robot reaches out of the screen and grabs your phone.' })).toBeVisible();
    await expect(page.getByText(FACT)).toBeVisible();
    // The game isn't there to use: not the station, not the menu.
    await expect(page.getByRole('region', { name: 'The station' })).toHaveCount(0);
    await expect(page.getByRole('navigation')).toHaveCount(0);
    // Once the claw has the phone (or at once, without WebGL), the boss speaks.
    await expect(page.getByText(LINE)).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('[data-speaking]')).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test('with reduced motion, the robot is already holding it and says so at once', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'only Chromium takes touch and a coarse pointer from isMobile');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/?analytics-test=1');
    await expect(page.locator('[data-speaking]')).toHaveCount(1, { timeout: 5_000 });
    await expect(page.getByText(LINE)).toBeVisible();
  });
});

test('a desktop window dragged phone-narrow still gets the game', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?analytics-test=1');
  await expect(page.getByRole('region', { name: 'The station' })).toBeVisible();
  await expect(page.getByText(FACT)).toBeHidden();
});
