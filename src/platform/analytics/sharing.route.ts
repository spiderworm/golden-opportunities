import type { Route } from "./+types/sharing.route";
import { setSharingFromRequest } from "./sharing.server";

export async function action({ request }: Route.ActionArgs) {
  const { status, body, cookie } = await setSharingFromRequest(request);
  const headers = new Headers({ "cache-control": "no-store" });
  if (cookie) headers.append("Set-Cookie", cookie);
  return Response.json(body, { status, headers });
}

export function loader() {
  return Response.json({ error: "POST only" }, { status: 405 });
}
