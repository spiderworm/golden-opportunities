// The token the assistant's tool server sends to POST /api/query: Frank's server-only capability, passed to
// the tool server through its environment, never into the model's context. Frank is binding it to the
// player's save (issueGameQueryToken), and this is the one place that will change when he does.

import { getQueryToken } from "~/query/access.server";

export function queryToken(): string {
  return getQueryToken();
}
