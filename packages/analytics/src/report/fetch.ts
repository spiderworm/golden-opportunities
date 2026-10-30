// Brings a game's batches down from the bucket to a folder on the Mac, only
// the ones not already there, and gives them back unzipped:
//   node src/report/fetch.ts <game> <folder>     e.g. waddleberg ~/Documents/Waddleberg/analytics/raw
// Uses the Mac's AWS credentials (run `aws login` if they've expired).
import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { deployed } from "../ingest/deployed.ts";
import type { Batch } from "./report.ts";

export async function fetchBatches(game: string, dir: string): Promise<{ batches: Batch[]; fetched: number }> {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const s3 = new S3Client({ region: deployed.region });
  let token: string | undefined;
  let fetched = 0;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: deployed.bucket, Prefix: `events/game=${game}/`, ContinuationToken: token }));
    for (const o of page.Contents ?? []) {
      const file = join(dir, o.Key!.replace(/^events\/game=[^/]+\//, "").replaceAll("/", "_"));
      if (existsSync(file)) continue;
      const got = await s3.send(new GetObjectCommand({ Bucket: deployed.bucket, Key: o.Key! }));
      writeFileSync(file, await got.Body!.transformToByteArray(), { mode: 0o600 });
      fetched++;
    }
    token = page.NextContinuationToken;
  } while (token);
  const batches = readdirSync(dir)
    .filter((f) => f.endsWith(".json.gz"))
    .map((f) => JSON.parse(gunzipSync(readFileSync(join(dir, f))).toString()) as Batch);
  return { batches, fetched };
}

if (import.meta.main) {
  const [game, dir] = process.argv.slice(2);
  if (!game || !dir) throw new Error("usage: node src/report/fetch.ts <game> <folder>");
  const { batches, fetched } = await fetchBatches(game, dir);
  console.log(`${fetched} new, ${batches.length} batches, ${batches.reduce((a, b) => a + b.events.length, 0)} events`);
}
