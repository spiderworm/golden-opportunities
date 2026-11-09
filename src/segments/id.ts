// A saved segment's id, as the server makes them: one pattern for the segment, the pins and the reports that carry
// it, so they can't drift (Frank, #407). A leaf: segments.ts, spec.ts and player.ts import each other's neighbours.
export const SEGMENT_ID = /^[a-z0-9-]{1,40}$/;
