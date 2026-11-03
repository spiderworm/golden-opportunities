import { expect, test } from '../fixtures';

/** A second of silence as a WAV: a real, playable song without shipping one. */
function silentWav(seconds = 1, rate = 8000): Buffer {
  const samples = seconds * rate;
  const wav = Buffer.alloc(44 + samples);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + samples, 4); wav.write('WAVE', 8);
  wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate, 28); wav.writeUInt16LE(1, 32); wav.writeUInt16LE(8, 34);
  wav.write('data', 36); wav.writeUInt32LE(samples, 40); wav.fill(128, 44);
  return wav;
}

test('with no songs listed, the music UI stays hidden', async ({ page }) => {
  await page.route('**/music/songs.json', route => route.fulfill({ json: { songs: [] } }));
  await page.goto('/investigate');
  await page.mouse.click(5, 5);
  await page.waitForTimeout(1000);
  await expect(page.locator('.music-dock')).toHaveCount(0);
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Music' })).toHaveCount(0);
  await expect(page.locator('.music-panel')).toHaveCount(0);
});

test('with songs listed, the dock waits in the menu, the first tap starts the music and the dock names it, and Settings has the panel', async ({ page }) => {
  await page.addInitScript(() => {
    const Context = window.AudioContext;
    const made: AudioContext[] = [];
    (window as unknown as { __musicContexts: AudioContext[] }).__musicContexts = made;
    window.AudioContext = class extends Context {
      constructor(options?: AudioContextOptions) {
        super(options);
        made.push(this);
      }
    };
    // the device's buttons (media keys, Bluetooth), as the browser hands them to the page
    const actions: Record<string, () => void> = {};
    (window as unknown as { __mediaActions: typeof actions }).__mediaActions = actions;
    const set = navigator.mediaSession.setActionHandler.bind(navigator.mediaSession);
    navigator.mediaSession.setActionHandler = (action, f) => {
      if (f) actions[action] = f as () => void;
      else delete actions[action];
      set(action, f);
    };
  });
  await page.route('**/music/songs.json', route =>
    route.fulfill({ json: { songs: [{ id: 'test-silence', file: 'test-silence.wav', title: 'Test Silence' }] } }));
  await page.route('**/music/test-silence.wav', route =>
    route.fulfill({ body: silentWav(), contentType: 'audio/wav' }));
  await page.goto('/investigate');
  // Nothing plays before a gesture.
  await page.waitForTimeout(800);
  const dock = page.locator('.music-dock');
  // In the menu's column, but not in its navigation landmark.
  await expect(page.getByRole('navigation', { name: 'Main menu' }).locator('.music-dock')).toHaveCount(0);
  await expect(dock).toContainText('Music');
  expect(await page.evaluate(() => (window as unknown as { __musicContexts: AudioContext[] }).__musicContexts.length)).toBe(0);
  await page.mouse.click(5, 5);
  await expect(dock).toContainText('Test Silence');
  // The music plays through Web Audio, made on that tap; the fixture sends every
  // Web Audio output to a silent gain node and mutes media elements.
  expect(await page.evaluate(() => (window as unknown as { __musicContexts: AudioContext[] }).__musicContexts.map(c => c.state))).toEqual(['running']);
  // The device names the song, and its pause and play are the dock's.
  expect(await page.evaluate(() => ({ title: navigator.mediaSession.metadata?.title, album: navigator.mediaSession.metadata?.album })))
    .toEqual({ title: 'Test Silence', album: 'Orbital Books' });
  await expect.poll(() => page.evaluate(() => navigator.mediaSession.playbackState)).toBe('playing');
  const press = (action: string) => page.evaluate(a => (window as unknown as { __mediaActions: Record<string, () => void> }).__mediaActions[a]!(), action);
  await press('pause');
  await expect(dock.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => navigator.mediaSession.playbackState)).toBe('paused');
  await press('play');
  await expect(dock.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  // It stays: no timer takes it away.
  await page.waitForTimeout(5000);
  await expect(dock).toContainText('Test Silence');
  // Its name opens the full player over the page; a tap outside closes it.
  await dock.getByRole('button', { name: 'Open the music player' }).click();
  await expect(page.getByRole('dialog', { name: 'Music' })).toBeVisible();
  await page.mouse.click(900, 300);
  await expect(page.getByRole('dialog', { name: 'Music' })).toHaveCount(0);
  // The collapsed menu keeps only pause / play.
  await page.getByRole('button', { name: 'Collapse menu' }).click();
  await expect(dock.locator('[data-do="play"]')).toBeVisible();
  await expect(dock.getByRole('button', { name: 'Next' })).toBeHidden();
  await page.getByRole('button', { name: 'Expand menu' }).click();
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('region', { name: 'Music' }).locator('.music-panel')).toBeVisible();
});

test("the game's tabs are one app: one song and one pause in every tab, heard only in the tab used last, and a reload carries on", async ({ context }) => {
  const thirty = silentWav(30); // long enough that no song ends mid-test
  await context.route('**/music/songs.json', route =>
    route.fulfill({ json: { songs: [{ id: 'test-silence', file: 'test-silence.wav', title: 'Test Silence' }] } }));
  await context.route('**/music/test-silence.wav', route => route.fulfill({ body: thirty, contentType: 'audio/wav' }));
  // each tab's own <audio>, to see which one is sounding
  await context.addInitScript(() => {
    const Real = window.Audio;
    const decks: HTMLAudioElement[] = [];
    (window as unknown as { __sounding: () => boolean }).__sounding = () => decks.some(d => !d.paused);
    window.Audio = function (src?: string) {
      const d = new Real(src);
      decks.push(d);
      return d;
    } as unknown as typeof Audio;
  });
  const play = (page: import('@playwright/test').Page) => page.locator('.music-dock [data-do="play"]');
  const sounding = (page: import('@playwright/test').Page) => page.evaluate(() => (window as unknown as { __sounding: () => boolean }).__sounding());

  const first = await context.newPage();
  await first.goto('/investigate');
  await expect(first.locator('.music-dock')).toContainText('Music'); // loaded: a tap now starts it
  await first.mouse.click(5, 5);
  await expect(play(first)).toHaveAttribute('aria-label', 'Pause');

  // A second tab, used now, carries the music on: the same song, playing, and
  // only this tab is heard.
  const second = await context.newPage();
  await second.goto('/investigate');
  await expect(second.locator('.music-dock')).toContainText('Test Silence');
  await second.mouse.click(5, 5);
  await expect.poll(() => sounding(second)).toBe(true);
  await expect.poll(() => sounding(first)).toBe(false);
  await expect(play(second)).toHaveAttribute('aria-label', 'Pause');
  await expect(play(first)).toHaveAttribute('aria-label', 'Pause');

  // Back to the first: it's heard again, and the second is quiet.
  await first.bringToFront();
  await first.mouse.click(5, 5);
  await expect.poll(() => sounding(first)).toBe(true);
  await expect.poll(() => sounding(second)).toBe(false);

  // A pause in one tab is the game's: every tab is paused.
  await play(first).click();
  await expect(play(first)).toHaveAttribute('aria-label', 'Play');
  await expect(play(second)).toHaveAttribute('aria-label', 'Play');
  await expect.poll(() => sounding(first)).toBe(false);

  // It holds through a reload; a tap doesn't undo it.
  await second.bringToFront();
  await second.reload();
  await expect(second.locator('.music-dock')).toContainText('Test Silence');
  await second.mouse.click(5, 5);
  await second.waitForTimeout(500);
  await expect(play(second)).toHaveAttribute('aria-label', 'Play');
  expect(await sounding(second)).toBe(false);

  // Play in either tab plays for both, heard where it was pressed.
  await play(second).click();
  await expect(play(second)).toHaveAttribute('aria-label', 'Pause');
  await expect(play(first)).toHaveAttribute('aria-label', 'Pause');
  await expect.poll(() => sounding(second)).toBe(true);
  await expect.poll(() => sounding(first)).toBe(false);
});
