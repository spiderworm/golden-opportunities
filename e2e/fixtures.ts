import { test as base, expect } from '@playwright/test';

export const test = base.extend({
  context: async ({ context, baseURL }, use) => {
    // Defense in depth: no test browser can deliver remote analytics.
    const origin = new URL(baseURL!).origin;
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
    await use(context);
  },
});

export { expect };
