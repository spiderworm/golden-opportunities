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
  await expect(scene.getByText(/THREE SEEMED LENIENT/)).toBeVisible();
  await expect(scene.getByText('60% of their list price')).toBeVisible();
  await expect(administrator).toHaveAttribute('aria-expanded', 'false');
  await expect(scene.getByText('January 1 to March 31, 2194')).toBeHidden();

  // So do Enter and Space, from the keyboard.
  await drone.focus();
  await page.keyboard.press('Enter');
  await expect(drone).toHaveAttribute('aria-expanded', 'true');
  await expect(scene.getByText('Portmeirion', { exact: true })).toBeVisible();
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

test('in 2D, a boss opens its bubble when clicked, and opening bubbles moves nothing', async ({ page }) => {
  // The 2D scene, as a browser without WebGL 2 gets it (else the 3D scene replaces it mid-test).
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      return type === 'webgl2' ? null : (getContext as (...args: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof getContext;
  });
  await page.goto('/decide?analytics-test=1');
  const scene = page.getByRole('region', { name: 'PLAN FOR Q1 2194' });
  // The tags (the scene's region also holds the form's buttons).
  const bubbles = scene.locator('button[data-tag]');
  await expect(bubbles).toHaveCount(5);
  await expect(scene.getByText('January 1 to March 31, 2194')).toBeVisible();
  await expect(scene.locator('[data-boss]')).toHaveCount(5);

  // Clicking a robot opens its bubble, like clicking the bubble.
  await scene.locator('[data-boss="culture"]').click();
  await expect(bubbles.nth(2)).toHaveAttribute('aria-expanded', 'true');
  await expect(scene.getByText('the author\'s shuttle fare and the room.')).toBeVisible();

  // Every bubble in turn: no robot, bubble or move shifts (the open boss steps forward by transform only).
  const layout = () => page.evaluate(() => ({
    robots: [...document.querySelectorAll('[data-boss]')].map(el => { const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }),
    bubbles: [...document.querySelectorAll('[data-tag]')].map(el => { const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }),
    form: (({ x, y, width, height }) => [x, y, width, height])((document.querySelector('fieldset') as HTMLElement).getBoundingClientRect()),
  }));
  // Nor does any boss reach into a neighbour's column, the open one stepping forward included (Goldy's ruling, 31 Oct):
  // each cutout's drawn picture, inside its contained image, lies within its tag's column.
  const overreach = () => page.evaluate(() => {
    const columns = [...document.querySelectorAll('[data-tag]')].map(tag => tag.closest('li')!.getBoundingClientRect());
    return [...document.querySelectorAll('[data-boss] img')].map((img, i) => {
      const box = img.getBoundingClientRect();
      const { naturalWidth, naturalHeight } = img as HTMLImageElement;
      const drawn = naturalWidth * Math.min(box.width / naturalWidth, box.height / naturalHeight);
      const middle = box.left + box.width / 2;
      return Math.max(columns[i]!.left - (middle - drawn / 2), middle + drawn / 2 - columns[i]!.right);
    });
  });
  await page.waitForTimeout(800); // the scene's entrance
  const before = await layout();
  for (let i = 0; i < 5; i++) {
    await bubbles.nth(i).click();
    await expect(bubbles.nth(i)).toHaveAttribute('aria-expanded', 'true');
    expect(await layout()).toEqual(before);
    await page.waitForTimeout(300); // the open boss's step forward
    for (const over of await overreach()) expect(over).toBeLessThanOrEqual(0.5);
  }
  // Nor does ticking moves: the stamp's space is kept, and the plan's status line keeps its height.
  await page.getByRole('checkbox', { name: /Re-pick Book of the Month/ }).check();
  await page.getByRole('checkbox', { name: /Weekday author nights/ }).check();
  await expect(page.getByRole('checkbox', { name: /Weekday author nights/ })).toBeChecked();
  expect(await layout()).toEqual(before);

  // Nor does a move's whole line: it opens over the scene on hover, pins with "More", and Escape closes it.
  const popover = page.locator('#move-more-events');
  await page.getByRole('checkbox', { name: /Weekday author nights/ }).hover();
  await expect(popover).toBeVisible();
  await expect(popover).toContainText('at $200 each.');
  expect(await layout()).toEqual(before);
  const more = page.getByRole('button', { name: 'More about Weekday author nights' });
  await more.click();
  // Pinned, it says "Less", and its name follows what it says.
  const less = page.getByRole('button', { name: 'Less about Weekday author nights' });
  await expect(less).toHaveAttribute('aria-expanded', 'true');
  await page.mouse.move(5, 5);
  await expect(popover).toBeVisible();
  expect(await layout()).toEqual(before);
  await less.focus();
  await page.keyboard.press('Escape');
  await expect(popover).toBeHidden();
  await expect(page.getByRole('button', { name: 'More about Weekday author nights' })).toHaveAttribute('aria-expanded', 'false');
});

test('a bubble focused in the 2D scene stays focused when the 3D scene takes over', async ({ page }) => {
  // Hold the 3D scene back, so the 2D scene is up first.
  let release!: () => void;
  const held = new Promise<void>(resolve => (release = resolve));
  await page.route(/BossScene3D/, async route => {
    await held;
    await route.continue();
  });
  await page.goto('/decide?analytics-test=1');
  const webgl = await page.evaluate(() => Boolean(document.createElement('canvas').getContext('webgl2')));
  test.skip(!webgl, 'no WebGL 2 here: the 2D scene stays');
  const scene = page.getByRole('region', { name: 'PLAN FOR Q1 2194' });
  const ministry = scene.getByRole('button', { name: /^The Ministry of Culture/ });
  await ministry.focus();
  await expect(ministry).toBeFocused();
  release();
  await expect(scene.locator('[aria-hidden="true"] canvas')).toBeVisible({ timeout: 30_000 });
  await expect(scene.getByRole('button', { name: /^The Ministry of Culture/ })).toBeFocused();
});

test('in 3D, a robot opens its bubble when clicked, and opening bubbles moves nothing', async ({ page }) => {
  await page.goto('/decide?analytics-test=1');
  const webgl = await page.evaluate(() => Boolean(document.createElement('canvas').getContext('webgl2')));
  test.skip(!webgl, 'no WebGL 2 here: the 2D test covers it');
  const scene = page.getByRole('region', { name: 'PLAN FOR Q1 2194' });
  // The tags (the scene's region also holds the form's buttons).
  const bubbles = scene.locator('button[data-tag]');
  // The stage says where each robot stands on the page (x, y of its feet, in px) once they're in.
  const stage = scene.locator('[data-robots]');
  await expect(stage).toHaveAttribute('data-robots', /^\d+,\d+(,\d+,\d+){4}$/, { timeout: 30_000 });

  const layout = () => page.evaluate(() => ({
    robots: document.querySelector<HTMLElement>('[data-robots]')!.dataset.robots,
    spans: document.querySelector<HTMLElement>('[data-robots]')!.dataset.spans,
    stage: (({ x, y, width, height }) => [x, y, width, height])(document.querySelector('[data-robots]')!.getBoundingClientRect()),
    bubbles: [...document.querySelectorAll('[data-tag]')].map(el => { const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }),
    form: (({ x, y, width, height }) => [x, y, width, height])((document.querySelector('fieldset') as HTMLElement).getBoundingClientRect()),
  }));
  await page.waitForTimeout(800); // the scene's entrance
  const before = await layout();

  // No boss reaches into a neighbour's column (Goldy's ruling, as in 2D): each one's span on the page lies
  // within its tag's column.
  const spans = await page.evaluate(() => {
    const stage = document.querySelector<HTMLElement>('[data-robots]')!;
    const left = stage.getBoundingClientRect().left;
    const across = stage.dataset.spans!.split(',').map(Number);
    return [...document.querySelectorAll('[data-tag]')].map((tag, i) => {
      const column = tag.closest('li')!.getBoundingClientRect();
      return { from: across[i * 2]! + left, to: across[i * 2 + 1]! + left, column: [column.left, column.right] };
    });
  });
  for (const { from, to, column } of spans) {
    expect(from).toBeGreaterThanOrEqual(column[0]! - 2);
    expect(to).toBeLessThanOrEqual(column[1]! + 2);
  }

  for (let i = 0; i < 5; i++) {
    await bubbles.nth(i).click();
    await expect(bubbles.nth(i)).toHaveAttribute('aria-expanded', 'true');
    await page.waitForTimeout(300); // the open boss's lean and glow
    expect(await layout()).toEqual(before);
    // The open boss steps forward only as far as its column allows, as in 2D.
    const [from, to, column] = await page.evaluate((i) => {
      const stage = document.querySelector<HTMLElement>('[data-robots]')!;
      const left = stage.getBoundingClientRect().left;
      const [from, to] = stage.dataset.openSpan!.split(',').map(Number);
      const column = document.querySelectorAll('[data-tag]')[i]!.closest('li')!.getBoundingClientRect();
      return [from! + left, to! + left, [column.left, column.right]] as const;
    }, i);
    expect(from).toBeGreaterThanOrEqual(column[0] - 2);
    expect(to).toBeLessThanOrEqual(column[1] + 2);
  }

  // Clicking a robot (the Ministry, third) opens its bubble, like clicking the bubble.
  const [x, y] = before.robots!.split(',').map(Number).slice(4, 6) as [number, number];
  await stage.click({ position: { x, y: y - 40 } });
  await expect(bubbles.nth(2)).toHaveAttribute('aria-expanded', 'true');
  expect(await layout()).toEqual(before);
});
