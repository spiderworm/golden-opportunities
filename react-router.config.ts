import type { Config } from "@react-router/dev/config";
import { parsePublicOrigin } from "./src/platform/origin.server";

// Deployed behind a proxy that ends TLS (docs/deploy.md), the app sees http://<host> while the browser's Origin is
// https://<host>, so React Router's own check on actions (a page's form or fetcher posting to a route) refuses every
// one with a bare 400 Bad Request, before the game's gates run (measured: `POST /alert/seen.data 400`). Its
// allowedActionOrigins names the deployed host, read from ORBITAL_PUBLIC_ORIGIN when the server is built, so the build
// must be made with the setting it will run with. The game's own gates (platform/origin.server.ts) still require the
// exact https origin.
const publicOrigin = parsePublicOrigin(process.env.ORBITAL_PUBLIC_ORIGIN);

export default {
  appDirectory: "src",
  ssr: true,
  ...(publicOrigin ? { allowedActionOrigins: [new URL(publicOrigin).host] } : {}),
} satisfies Config;
