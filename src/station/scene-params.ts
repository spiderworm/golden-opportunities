// How the station's hooks (busyness, the featured title) turn into what the
// scene shows. Pure, so a played quarter's effect on the scene can be tested.

/** 0 (an empty shop) to 1 (packed), clamped; anything not a number counts as 0. */
export function clampBusyness(busyness: number): number {
  return Number.isFinite(busyness) ? Math.min(1, Math.max(0, busyness)) : 0;
}

export const MAX_SHOPPERS = 8;
export const MAX_SHUTTLES = 4;

export interface SceneLevels {
  /** Browsing customers inside the shop (the keeper behind the counter is extra). */
  shoppers: number;
  /** Shuttles circling the station. */
  shuttles: number;
  /** Multiplier on the shop's lights and sign, 0.55 to 1. */
  glow: number;
}

export function sceneLevels(busyness: number): SceneLevels {
  const b = clampBusyness(busyness);
  return {
    shoppers: Math.round(b * MAX_SHOPPERS),
    shuttles: 1 + Math.round(b * (MAX_SHUTTLES - 1)),
    glow: 0.55 + 0.45 * b,
  };
}

/** Seconds outside before the opening glide starts, and how long a glide takes. */
export const OPENING_HOLD = 1.5;
export const GLIDE_SECONDS = 9;
