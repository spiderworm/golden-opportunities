// The token the assistant's tool server sends to POST /api/query. Frank's getQueryToken()
// (src/query/access.server.ts) will replace this; until it lands, ORBITAL_QUERY_TOKEN stands in, and without
// it the assistant says the data terminal isn't connected rather than starting.

import { AssistantUnavailable } from "./provider.server.ts";

export function queryToken(env = process.env): string {
  const token = env.ORBITAL_QUERY_TOKEN;
  if (!token) throw new AssistantUnavailable("The data terminal isn't connected yet.");
  return token;
}
