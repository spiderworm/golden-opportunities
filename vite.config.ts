import { readFileSync } from "node:fs";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig, type Plugin } from "vite";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
// The studio's build-id convention: UTC time the build (or dev server) started, yyyymmddhhmmss.
const build = new Date().toISOString().replace(/\D/g, "").slice(0, 14);

/**
 * Records the dev server's actual address for Dewey's tool server (src/assistant/tools/toolServer.server.ts): Vite
 * moves to 5174 when 5173 is busy, and only the server knows where it ended up. Never the request's Host (#150).
 */
function listeningAddress(): Plugin {
  return {
    name: "orbital-listening-address",
    configureServer(server) {
      server.httpServer?.once("listening", () => {
        const address = server.httpServer?.address();
        if (!address || typeof address !== "object") return;
        process.env.ORBITAL_LISTEN_PORT = String(address.port);
        process.env.ORBITAL_LISTEN_HOST = address.address;
      });
    },
  };
}

export default defineConfig({
  plugins: [reactRouter(), listeningAddress()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_BUILD__: JSON.stringify(build),
  },
  resolve: {
    tsconfigPaths: true,
  },
  optimizeDeps: {
    // The station's 3D loads lazily, so the dev server would only find these
    // on the first visit and reload mid-import ("Importing a module script
    // failed" in WebKit). Bundle them up front instead.
    include: ["three", "@react-three/fiber", "@react-three/drei"],
  },
});
