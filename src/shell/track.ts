// Features record use through an injected track function. The platform's
// analytics (src/platform/analytics/) isn't built yet.
// TODO(analytics): replace noopTrack with the platform's track() when it lands.
// Props describe what happened, never content.
export type TrackProps = Record<string, string | number | boolean>;
export type Track = (event: string, props?: TrackProps) => void;

export const noopTrack: Track = () => {};
