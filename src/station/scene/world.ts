import { Bookshop } from "./bookshop";

// The station's live state, kept outside the canvas so it outlives it.
// Leaving the Station screen unmounts the canvas; coming back resumes the
// scene where it was (shoppers mid-path, robots mid-chore, books where they
// were left, the station turned as far as it had), matching the held frame
// shown in the meantime. Time stands still while the player is away. It
// lives as long as the page: a reload opens the shop afresh.

interface World {
  /** Seconds the scene has run, across visits. Each new canvas's clock starts from here. */
  elapsed: number;
  shop: Bookshop;
  kept: Map<string, unknown>;
}

let world: World | undefined;

function current(): World {
  world ??= { elapsed: 0, shop: openingShop(), kept: new Map() };
  return world;
}

function openingShop() {
  const shop = new Bookshop();
  // A couple of books already out of place, so the robots have work from the start.
  shop.misplace(-6.6, 1.0);
  shop.misplace(1.2, -4.3);
  return shop;
}

/** The shop's books, wherever shoppers and robots have left them. */
export function stationShop(): Bookshop {
  return current().shop;
}

/** How long the scene has run, in seconds. */
export function stationElapsed(): number {
  return current().elapsed;
}

/** Records how long the scene has run; call it every frame. */
export function keepElapsed(seconds: number) {
  current().elapsed = seconds;
}

/**
 * State that should outlive the canvas: made on the scene's first visit,
 * then the same object on every visit after. Only plain state belongs here,
 * never anything a renderer owns and disposes (geometries, materials).
 */
export function kept<T>(key: string, make: () => T): T {
  const { kept: all } = current();
  if (!all.has(key)) all.set(key, make());
  return all.get(key) as T;
}

/** State another part of the scene keeps, if it has made it yet; never makes it (so its maker's `make` still runs). */
export function peek<T>(key: string): T | undefined {
  return current().kept.get(key) as T | undefined;
}

/** Forgets everything, as a reload would. For tests. */
export function forgetStation() {
  world = undefined;
}
