import type { Route } from "./+types/sharing.route";
import { setSharingFromRequest } from "./sharing.server";

export async function action({ request }: Route.ActionArgs) {
  const { status, body } = await setSharingFromRequest(request);
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export function loader() {
  return Response.json({ error: "POST only" }, { status: 405 });
}
