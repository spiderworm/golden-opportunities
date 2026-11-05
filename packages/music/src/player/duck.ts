// The music let down a moment under a game's sound (Waddleberg's win bells,
// 2026), and back: down to `level` over `down` ms, held `hold` ms, back up
// over `up` ms. Through Web Audio only (`context`), on a gain of its own
// after the volume's, so the two never fight.

export type DuckShape = { level: number; down: number; hold: number; up: number };
/** Waddleberg's, under its bells */
export const DUCK: DuckShape = { level: 0.3, down: 180, hold: 1500, up: 1100 };

/** The duck as steps for a gain, from `t` seconds: to the level and back. */
export function duckSteps(t: number, shape: DuckShape = DUCK): { at: number; to: number; ramp: boolean }[] {
  const { level, down, hold, up } = shape;
  return [
    { at: t, to: 1, ramp: false },
    { at: t + down / 1000, to: level, ramp: true },
    { at: t + (down + hold) / 1000, to: level, ramp: false },
    { at: t + (down + hold + up) / 1000, to: 1, ramp: true },
  ];
}

/** Schedule the duck on `gain`, from now, over any duck still going. */
export function duckOn(gain: GainNode, shape: DuckShape = DUCK) {
  const g = gain.gain;
  const now = gain.context.currentTime;
  g.cancelScheduledValues(now);
  for (const s of duckSteps(now, shape)) (s.ramp ? g.linearRampToValueAtTime(s.to, s.at) : g.setValueAtTime(s.to, s.at));
}
