// Where an app is running now lives in @tellim/platform (Music's request, 31 Oct 2026),
// so every package asks the same question. Reached by path: analytics has no
// dependencies to install, and games already link to both packages' folders.
export * from "../../../platform/src/environment/environment.ts";
