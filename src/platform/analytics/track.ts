// The one analytics interface features use (How We Build, principle 3).
// Events record what happened, never content. The single exception is the
// text players type to the in-game agent, which is held on the device
// (`{ hold: "agent_text" }`) until David decides whether it's ever sent.

export type Props = Record<string, string | number | boolean>;
export type TrackOptions = { hold?: "agent_text" };
export type Track = (event: string, props?: Props, options?: TrackOptions) => void;

export const GAME = "orbital-books";

/** The release and build, from Vite's define (vite.config.ts); fallbacks for tests. */
export const VERSION: string = typeof __APP_VERSION__ === "undefined" ? "0.0.0" : __APP_VERSION__;
export const BUILD: string = typeof __APP_BUILD__ === "undefined" ? "test" : __APP_BUILD__;
