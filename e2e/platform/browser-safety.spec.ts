import { test, expect } from '../fixtures';

test('browser fixture silences Web Audio and media elements', async ({ page }) => {
  await page.goto('/?analytics-test=1');
  const safety = await page.evaluate(async () => {
    const context = new OfflineAudioContext(1, 128, 44100);
    const oscillator = context.createOscillator();
    oscillator.connect(context.destination);
    oscillator.start();
    const rendered = await context.startRendering();
    const audio = document.createElement('audio');
    document.body.append(audio);
    audio.muted = false;
    await new Promise(resolve => setTimeout(resolve, 0));
    return {
      silent: rendered.getChannelData(0).every(sample => sample === 0),
      muted: audio.muted,
      volume: audio.volume,
    };
  });
  expect(safety).toEqual({ silent: true, muted: true, volume: 0 });
});
