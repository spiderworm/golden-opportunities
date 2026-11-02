import type { ShouldRevalidateFunctionArgs } from "react-router";

/**
 * For loaders above a page (root's, the shell's): a new question on the same page, such as Investigate's filters
 * in the URL's search, changes nothing they return, so they don't run again for it. Every action still
 * revalidates them, so the shell's data version follows a plan commit, Play again or a reset.
 */
export function revalidateAbovePage({ formMethod, currentUrl, nextUrl, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
  if (!formMethod && currentUrl.pathname === nextUrl.pathname) return false;
  return defaultShouldRevalidate;
}
