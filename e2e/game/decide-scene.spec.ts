import { test, expect } from '../fixtures';

test('the bosses brief the plan together: the Administrator first, then whichever bubble is selected', async ({ page, browserName }) => {
  await page.goto('/decide?analytics-test=1');
  const scene = page.getByRole('region', { name: 'PLAN FOR Q1 2194' });
  const bubble = (name: string) => scene.getByRole('button', { name: new RegExp(`^${name}`) });
  const administrator = bubble('The Station Administrator');
  const commerce = bubble('The Commerce Office');
  const drone = bubble("The Readers' Guild survey drone");
  const throughput = bubble('The Throughput Subcommittee');

  // On load, the Administrator's bubble is open, with its full line and facts.
  await expect(administrator).toHaveAttribute('aria-expanded', 'true');
  await expect(scene).toContainText('January 1 to March 31, 2194');
  await expect(commerce).toHaveAttribute('aria-expanded', 'false');
  await expect(scene.getByText('60% of their list price')).toBeHidden();

  // A click opens another, and closes the first.
  await commerce.click();
  await expect(commerce).toHaveAttribute('aria-expanded', 'true');
  await expect(commerce).toContainText('THREE SEEMED LENIENT');
  await expect(scene.getByText('60% of their list price')).toBeVisible();
  await expect(administrator).toHaveAttribute('aria-expanded', 'false');
  await expect(scene.getByText('January 1 to March 31, 2194')).toBeHidden();

  // So do Enter and Space, from the keyboard.
  await drone.focus();
  await page.keyboard.press('Enter');
  await expect(drone).toHaveAttribute('aria-expanded', 'true');
  await expect(scene.getByText('Portmeirion')).toBeVisible();
  // Safari moves between buttons with Option+Tab; plain Tab skips them by default.
  await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab');
  await expect(throughput).toBeFocused();
  await page.keyboard.press('Space');
  await expect(throughput).toHaveAttribute('aria-expanded', 'true');
  await expect(drone).toHaveAttribute('aria-expanded', 'false');

  // Whichever bubble is open, the moves and the rule they turn on stay in reach.
  await expect(page.getByText('Your score is your lowest measure: Profit, Readers served, Happiness or Culture.')).toBeVisible();
  await page.getByRole('checkbox', { name: /Weekday author nights/ }).check();
  await expect(page.getByRole('checkbox', { name: /Weekday author nights/ })).toBeChecked();
});

test('where the browser can draw them, the bosses stand in 3D under the same bubbles', async ({ page }) => {
  await page.goto('/decide?analytics-test=1');
  const scene = page.getByRole('region', { name: 'PLAN FOR Q1 2194' });
  const webgl = await page.evaluate(() => Boolean(document.createElement('canvas').getContext('webgl2')));
  test.skip(!webgl, 'no WebGL 2 here: the 2D scene stands in');
  // The robots are decoration on a canvas the bubbles above describe.
  await expect(scene.locator('[aria-hidden="true"] canvas')).toBeVisible({ timeout: 30_000 });
  const ministry = scene.getByRole('button', { name: /^The Ministry of Culture/ });
  await ministry.click();
  await expect(ministry).toHaveAttribute('aria-expanded', 'true');
  await expect(scene.getByRole('button', { name: /^The Station Administrator/ })).toHaveAttribute('aria-expanded', 'false');
});
