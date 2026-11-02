// The one analytics interface features use (How We Build, principle 3).
// Events record what happened, never content. The exception is the in-game
// agent's text: what players type to it, and the sentences of its replies the
// figures gate withheld (#162). Both are held on the machine that records them
// (`{ hold: "agent_text" }`) until David decides whether they're ever sent.

export type Props = Record<string, string | number | boolean>;
export type TrackOptions = { hold?: "agent_text" };
export type Track = (event: string, props?: Props, options?: TrackOptions) => void;

export const GAME = "orbital-books";

/** The release and build, from Vite's define (vite.config.ts); fallbacks for tests. */
export const VERSION: string = typeof __APP_VERSION__ === "undefined" ? "0.0.0" : __APP_VERSION__;
export const BUILD: string = typeof __APP_BUILD__ === "undefined" ? "test" : __APP_BUILD__;
