import { readFileSync } from "node:fs";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
// The studio's build-id convention: UTC time the build (or dev server) started, yyyymmddhhmmss.
const build = new Date().toISOString().replace(/\D/g, "").slice(0, 14);

export default defineConfig({
  plugins: [reactRouter()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_BUILD__: JSON.stringify(build),
  },
  resolve: {
    tsconfigPaths: true,
  },
});
