import { afterEach, describe, expect, it } from "vitest";
import {
  agentEvidence,
  canonicalQuery,
  dropAgentEvidence,
  keepAgentEvidence,
  MAX_PER_TOKEN,
  MAX_TOKENS,
  resetAgentEvidenceForTests,
  TTL_MS,
} from "./agent-evidence.server";

afterEach(resetAgentEvidenceForTests);

const evidence = (n: number) => ({
  unit: "ratings" as const,
  rows: [{ n, se: 0.1 }],
  total: { n, se: 0.1 },
});
const query = { measure: "avg_rating", by: ["genre"] };

describe("Dewey's lookups' evidence, kept for his panel only (Goldy's and Chart's design)", () => {
  it("is found under its answer's token and query, whatever the key order", () => {
    keepAgentEvidence("t1", query, evidence(5), 0);
    expect(agentEvidence("t1", { by: ["genre"], measure: "avg_rating" }, 1)).toEqual(evidence(5));
    expect(canonicalQuery({ b: 1, a: [{ d: 2, c: 3 }] })).toBe('{"a":[{"c":3,"d":2}],"b":1}');
    // Another answer's token finds nothing.
    expect(agentEvidence("t2", query, 1)).toBeNull();
  });

  it("finds nothing once the answer's token is dropped, or once the entry is past its time", () => {
    keepAgentEvidence("t1", query, evidence(5), 0);
    dropAgentEvidence("t1");
    expect(agentEvidence("t1", query, 1)).toBeNull();
    keepAgentEvidence("t1", query, evidence(5), 0);
    expect(agentEvidence("t1", query, TTL_MS)).toEqual(evidence(5));
    expect(agentEvidence("t1", query, TTL_MS + 1)).toBeNull();
  });

  it("keeps nothing for a result without evidence", () => {
    keepAgentEvidence("t1", query, undefined, 0);
    expect(agentEvidence("t1", query, 1)).toBeNull();
  });

  it("evicts oldest first: entries within a token, and tokens", () => {
    for (let i = 0; i <= MAX_PER_TOKEN; i++)
      keepAgentEvidence("t1", { measure: "units", limit: i + 1 }, evidence(i), i);
    expect(agentEvidence("t1", { measure: "units", limit: 1 }, MAX_PER_TOKEN)).toBeNull();
    expect(agentEvidence("t1", { measure: "units", limit: 2 }, MAX_PER_TOKEN)).toEqual(evidence(1));
    resetAgentEvidenceForTests();
    for (let i = 0; i <= MAX_TOKENS; i++) keepAgentEvidence(`t${i}`, query, evidence(i), i);
    expect(agentEvidence("t0", query, MAX_TOKENS)).toBeNull();
    expect(agentEvidence("t1", query, MAX_TOKENS)).toEqual(evidence(1));
  });
});
