// The studio's apps, by id: the one list, so no two claim the same id or
// storage, however many share a host (David, 31 Oct 2026). Add an app here
// before it calls defineApp. An id is for good: a rename changes the name only.
export const APPS = {
  waddleberg: { name: "Waddleberg", storagePrefix: "cubeberg" }, // was Cubeberg: players' saves are under it
  pizza: { name: "Pizza Slicer Pro" },
  "orbital-books": { name: "Orbital Books" },
  analytics: { name: "Tellim Analytics", storagePrefix: "tellim-analytics" },
} satisfies Record<string, { name: string; storagePrefix?: string }>;

export type AppId = keyof typeof APPS;
