import { test as base, expect, type BrowserContext, type Page, type Request } from '@playwright/test';

export async function prepareContext(context: BrowserContext, baseURL: string) {
  // Defense in depth: no test browser can deliver remote analytics.
  const origin = new URL(baseURL).origin;
  await context.route('**/*', route => {
    return new URL(route.request().url()).origin === origin
      ? route.continue()
      : route.abort();
  });
  await context.addInitScript(() => {
    // Runs before application code, including in newly created frames.
    const connect = AudioNode.prototype.connect;
    const silentOutputs = new WeakMap<BaseAudioContext, GainNode>();
    AudioNode.prototype.connect = function (this: AudioNode, ...args: [AudioNode | AudioParam, number?, number?]) {
      if (args[0] === this.context.destination) {
        let silent = silentOutputs.get(this.context);
        if (!silent) {
          silent = this.context.createGain();
          silent.gain.value = 0;
          Reflect.apply(connect, silent, [this.context.destination]);
          silentOutputs.set(this.context, silent);
        }
        args[0] = silent;
      }
      return Reflect.apply(connect, this, args);
    } as AudioNode['connect'];
    // Covers detached elements, autoplay, and later attempts to unmute.
    const muted = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'muted')!;
    Object.defineProperty(HTMLMediaElement.prototype, 'muted', {
      get: muted.get,
      set() { muted.set!.call(this, true); },
    });
    const volume = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume')!;
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      muted.set!.call(this, true);
      volume.set!.call(this, 0);
      return play.call(this);
    };
    const mute = (element: HTMLMediaElement) => {
      if (!element.muted) muted.set!.call(element, true);
      if (element.volume !== 0) volume.set!.call(element, 0);
    };
    new MutationObserver(() => document.querySelectorAll('audio, video').forEach(element => mute(element as HTMLMediaElement)))
      .observe(document, { subtree: true, childList: true });
    document.addEventListener('volumechange', event => {
      if (event.target instanceof HTMLMediaElement) mute(event.target);
    }, true);
  });
}

/**
 * Collects a page's errors into `errors`, less one WebKit quirk. WebKit reports
 * a same-origin fetch that a navigation cuts off as a page error ("Fetch API
 * cannot load <url> due to access control checks."), even when the app
 * catches it (e2e/game/notes.md). That one is skipped, and only while a
 * main-frame navigation is in flight; every other error still counts.
 */
export function collectPageErrors(page: Page, baseURL: string, errors: string[]) {
  const origin = new URL(baseURL).origin;
  let navigating = 0;
  const main = (request: Request) => request.isNavigationRequest() && request.frame() === page.mainFrame();
  const settled = (request: Request) => {
    if (main(request)) navigating = Math.max(0, navigating - 1);
  };
  page.on('request', request => {
    if (main(request)) navigating++;
  });
  page.on('requestfinished', settled);
  page.on('requestfailed', settled);
  page.on('pageerror', error => {
    // Playwright splits this message at its first colon, so read the stack's first line.
    const cut = /^Fetch API cannot load (\S+) due to access control checks\.$/.exec((error.stack ?? '').split('\n')[0]!);
    if (cut && navigating > 0 && new URL(cut[1]!).origin === origin) return;
    errors.push(error.message);
  });
}

export const test = base.extend({
  context: async ({ context, baseURL }, use) => {
    await prepareContext(context, baseURL!);
    await use(context);
  },
});

export { expect };
