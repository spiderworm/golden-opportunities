import type { AnimationAction, AnimationMixer, Group } from "three";

/** One resident: a clone of a variant's rigged model, with its own motions. */
export interface Figure {
  root: Group;
  mixer: AnimationMixer;
  walk: AnimationAction;
  idle: AnimationAction;
  walking: boolean;
}

/**
 * Sets every figure standing idle, out of step with each other, once, as
 * they're made. They're kept across visits (see world.ts), so nothing stops
 * their actions when the canvas goes: a figure whose actions were stopped and
 * never restarted would stand in its rig's T-pose.
 */
export function startIdling(figures: readonly Figure[], random = Math.random) {
  for (const f of figures) {
    f.walking = false;
    f.idle.play();
    f.idle.time = random() * f.idle.getClip().duration;
    // Posed now, before the first frame draws.
    f.mixer.update(0);
  }
}

/** Crossfades a figure between walking and standing. */
export function setWalking(f: Figure, walking: boolean) {
  if (f.walking === walking) return;
  f.walking = walking;
  const [from, to] = walking ? [f.idle, f.walk] : [f.walk, f.idle];
  to.reset().play();
  from.crossFadeTo(to, 0.3, false);
}
