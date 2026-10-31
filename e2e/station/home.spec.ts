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
  expect(scripts.filter(path => /StationScene|\/three\/|@react-three|recast/.test(path))).toEqual([]);
});

test('the station fetches its navigation as WebAssembly, not the larger JavaScript build of it', async ({ page }) => {
  const fetched: string[] = [];
  page.on('request', request => fetched.push(new URL(request.url()).pathname));
  await page.goto('/?analytics-test=1');
  await page.getByRole('dialog', { name: 'Transmission from the Commerce Office' }).getByRole('button', { name: 'Later' }).click();
  const station = page.getByRole('region', { name: 'The station' });
  const still = station.getByText("can't show the station in 3D");
  await expect(station.getByRole('button', { name: /Go inside|Step outside/ }).or(still)).toBeVisible({ timeout: 15_000 });
  test.skip(await still.isVisible(), 'no WebGL 2 here: no 3D station');
  await expect(station).toHaveAttribute('data-drawn', 'true', { timeout: 30_000 });
  expect(fetched.filter(path => /recast.*\.wasm$/.test(path))).toHaveLength(1);
  expect(fetched.filter(path => /wasm-compat/.test(path))).toEqual([]);
});

test('the station opens inside, then wherever the player left it', async ({ page }) => {
  // Three scene loads (first visit and two reloads): under a full run's load they can pass 30 s.
  test.setTimeout(60_000);
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
    // And counts pictures made into URLs: the held frame is one, once its encode has finished.
    const createObjectURL = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (object: Blob | MediaSource) => {
      (window as unknown as { pictures: number }).pictures = ((window as unknown as { pictures?: number }).pictures ?? 0) + 1;
      return createObjectURL(object);
    };
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

  const pictures = await page.evaluate(() => (window as unknown as { pictures?: number }).pictures ?? 0);
  await page.getByRole('link', { name: 'Investigate' }).click();
  await expect(station).toHaveCount(0);
  // The frame is kept as the player leaves, but encoded a moment later, and until then there's deliberately
  // none (held-frame.ts). A player is never back that fast; under load, this test could be.
  await page.waitForFunction((before) => ((window as unknown as { pictures?: number }).pictures ?? 0) > before, pictures);
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

test('coming back to the station resumes the scene where it was left', async ({ page }) => {
  // Lets the test read the canvas between frames. Only in this test's browser.
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, options?: object) {
      return getContext.call(this, kind, kind === 'webgl2' ? { ...options, preserveDrawingBuffer: true } : options);
    } as typeof getContext;
  });
  await page.goto('/?analytics-test=1');
  await page.getByRole('dialog', { name: 'Transmission from the Commerce Office' }).getByRole('button', { name: 'Later' }).click();
  const station = page.getByRole('region', { name: 'The station' });
  const control = station.getByRole('button', { name: /Go inside|Step outside/ });
  const still = station.getByText("can't show the station in 3D");
  await expect(control.or(still)).toBeVisible({ timeout: 15_000 });
  test.skip(await still.isVisible(), 'no WebGL 2 here: no scene to resume');
  await expect(station).toHaveAttribute('data-drawn', 'true', { timeout: 30_000 });
  // Let the shoppers, robots and station move well away from where they start.
  await page.waitForTimeout(6_000);
  await page.getByRole('link', { name: 'Investigate' }).click();
  await expect(station).toHaveCount(0);
  await page.waitForTimeout(1_000);

  // The frame kept as the player left, against the new scene's first drawn frame,
  // both small and grey. Time stands still while the player is away, so they should match.
  const difference = await page.evaluate(async () => {
    const grey = (source: CanvasImageSource) => {
      const small = document.createElement('canvas');
      small.width = 96;
      small.height = 64;
      const g = small.getContext('2d')!;
      g.drawImage(source, 0, 0, small.width, small.height);
      const { data } = g.getImageData(0, 0, small.width, small.height);
      return Array.from({ length: data.length / 4 }, (_, i) => (data[i * 4]! + data[i * 4 + 1]! + data[i * 4 + 2]!) / 3);
    };
    [...document.querySelectorAll('a')].find(a => a.textContent?.trim() === 'Station')!.click();
    let held: string | undefined;
    const first = await new Promise<number[]>(done => {
      const look = () => {
        const section = document.querySelector<HTMLElement>('section[aria-label="The station"]');
        held ??= section?.querySelector('img')?.src;
        if (section?.dataset.drawn) done(grey(section.querySelector('canvas')!));
        else requestAnimationFrame(look);
      };
      look();
    });
    if (!held) return null;
    const picture = new Image();
    picture.src = held;
    await picture.decode();
    const kept = grey(picture);
    return kept.reduce((sum, v, i) => sum + Math.abs(v - first[i]!), 0) / kept.length;
  });
  // Measured on 30 Oct (mean grey difference of 255): a scene that restarts
  // differs by about 11.5 (webkit) to 16.5 (chromium); a resumed one by about
  // 1.2 (webkit) to 7.5 (chromium, whose software rendering takes a few slow
  // frames between the first draw and this read).
  expect(difference).not.toBeNull();
  expect(difference!).toBeLessThan(10);
});

test("when the station's code doesn't arrive, the still picture says so, and doesn't blame the device", async ({ page, browserName }) => {
  // When each request for the scene's code came, in ms after the first; none gets through.
  let first = 0;
  const tries: number[] = [];
  await page.route(/StationScene[^/]*\.js$/, route => {
    tries.push(first ? Date.now() - first : ((first = Date.now()), 0));
    return route.abort();
  });
  await page.goto('/?analytics-test=1');
  const webgl = await page.evaluate(() => Boolean(document.createElement('canvas').getContext('webgl2')));
  test.skip(!webgl, "no WebGL 2 here: the device's own note is right");
  await page.getByRole('dialog', { name: 'Transmission from the Commerce Office' }).getByRole('button', { name: 'Later' }).click();
  const station = page.getByRole('region', { name: 'The station' });
  await expect(station.getByText("The station didn't load in 3D, so here it is from the shuttle.")).toBeVisible({ timeout: 15_000 });
  await expect(station.getByText("can't show the station in 3D")).toHaveCount(0);
  // It was tried again a moment later before giving up. WebKit keeps a failed module as failed, so there its
  // second try makes no request (see retry.ts): checked where the retry can fetch.
  if (browserName !== 'webkit') expect(tries.some(at => at >= 900)).toBe(true);
});

test("a failed fetch of the station's code is tried once more", async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'WebKit keeps a failed module as failed: its second try makes no request');
  // Refused for its first half second (a preload and the import itself can both ask), then let through.
  let first = 0;
  const late: number[] = [];
  await page.route(/StationScene[^/]*\.js$/, route => {
    const at = first ? Date.now() - first : ((first = Date.now()), 0);
    if (at < 500) return route.abort();
    late.push(at);
    return route.continue();
  });
  await page.goto('/?analytics-test=1');
  const webgl = await page.evaluate(() => Boolean(document.createElement('canvas').getContext('webgl2')));
  test.skip(!webgl, 'no WebGL 2 here: no 3D station to load');
  await page.getByRole('dialog', { name: 'Transmission from the Commerce Office' }).getByRole('button', { name: 'Later' }).click();
  const station = page.getByRole('region', { name: 'The station' });
  await expect(station.getByRole('button', { name: /Go inside|Step outside/ })).toBeVisible({ timeout: 15_000 });
  expect(late.some(at => at >= 900)).toBe(true);
});
