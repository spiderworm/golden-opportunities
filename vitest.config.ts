import { defineConfig } from "vitest/config";

// Separate from vite.config.ts so tests run without the React Router plugin.
// packages/ keeps its own `node --test` suites.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: { include: ["src/**/*.test.ts", "src/**/*.test.tsx", "tools/**/*.test.ts"], passWithNoTests: true },
});
