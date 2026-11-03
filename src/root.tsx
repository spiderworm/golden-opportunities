import { useEffect } from "react";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";
import { entryGate } from "./entry/gate.server";
import { startAnalytics } from "./platform/analytics/analytics.client";
import { serverAnalytics } from "./platform/analytics/analytics.server";
import { instanceId } from "./platform/analytics/instance.server";
import { closedMiddleware } from "./platform/closed/closed.server";
import { revalidateAbovePage } from "./platform/revalidate";
import "./platform/theme/theme.css";
import { useIsPhone } from "./phone/phone";
import { PhoneScreen } from "./phone/PhoneScreen";

// Closed mode runs first, so a closed game runs no loader, action or agent; then the entry page, at any URL,
// until the player has agreed (David, 3 Nov 2026). A visitor who hasn't agreed yet gets the closed page (Goldy).
export const middleware: Route.MiddlewareFunction[] = [closedMiddleware, entryGate];

export function loader() {
  serverAnalytics();
  return { instance: instanceId() };
}

export const shouldRevalidate = revalidateAbovePage;

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App({ loaderData }: Route.ComponentProps) {
  useEffect(() => {
    startAnalytics(loaderData.instance);
  }, [loaderData.instance]);
  // A phone gets one scene instead of the game. Its stylesheet shows the scene
  // and hides the page from the first paint; once the browser has said it's a
  // phone, the game isn't mounted at all.
  const phone = useIsPhone();
  return (
    <>
      <PhoneScreen active={phone} />
      {!phone && <Outlet />}
    </>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Something went wrong";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "Not found" : "Error";
    details =
      error.status === 404 ? "The requested page could not be found." : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main>
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre>
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
