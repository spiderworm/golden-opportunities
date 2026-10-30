// The analytics endpoint (a Lambda): each good batch a game (../client) POSTs
// is kept gzipped at events/game=<g>/dt=<day received>/, with its version: as
// reported, or from config/versions.json (versionFrom says which). Nothing is
// logged, no address kept. CommonJS, under 4 KB: it's inlined in stack.ts.
const { gzipSync } = require("node:zlib");
const { randomUUID } = require("node:crypto");

const MAX_BYTES = 16384; // the client sends under 12 KB a request
const NAME = /^[a-z][a-z0-9_]{0,39}$/;
const isFlat = (p) =>
  !!p && typeof p === "object" && !Array.isArray(p) && Object.keys(p).length <= 40 &&
  Object.entries(p).every(([k, v]) => k.length <= 40 && (typeof v === "number" || typeof v === "boolean" || (typeof v === "string" && v.length <= 200)));
const isEvent = (e) =>
  !!e && Number.isFinite(e.t) && Number.isInteger(e.n) && typeof e.s === "string" && e.s.length <= 16 && NAME.test(e.e) && isFlat(e.p);

// version from the table: {releases: {game: {build: v}}, versions: {game: [[since, v]]}}
function lookup(t, game, build) {
  const play = t.releases?.[game]?.[build];
  if (play) return { version: play, versionFrom: "play" };
  let v;
  if (/^\d{14}$/.test(build)) for (const [at, name] of t.versions?.[game] ?? []) if (at <= build) v = name;
  return v ? { version: v, versionFrom: "code" } : {};
}

// the batch as kept, with where it goes, or why it's refused
function check(raw, games, now, table = {}) {
  if (!raw || raw.length > MAX_BYTES) return { status: 413 };
  let b;
  try {
    b = JSON.parse(raw);
  } catch {
    return { status: 400 };
  }
  if (!b || b.v !== 1 || !games.has(b.game)) return { status: 400 };
  if (!/^[A-Za-z0-9-]{8,64}$/.test(b.install) || !/^[a-z]{1,16}$/.test(b.platform) || !/^[\w.+-]{1,40}$/.test(b.build)) return { status: 400 };
  if (!Number.isInteger(b.tz) || Math.abs(b.tz) > 900) return { status: 400 };
  if (!Array.isArray(b.events) || !b.events.length || b.events.length > 400 || !b.events.every(isEvent)) return { status: 400 };
  const day = new Date(now).toISOString().slice(0, 10);
  const ver = typeof b.version === "string" && /^[\w.+-]{1,40}$/.test(b.version) ? { version: b.version, versionFrom: "reported" } : lookup(table, b.game, b.build);
  const data = { rt: now, game: b.game, install: b.install, platform: b.platform, build: b.build, ...ver, tz: b.tz, events: b.events.map(({ t, s, n, e, p }) => ({ t, s, n, e, p })) };
  return { status: 200, key: `events/game=${b.game}/dt=${day}/${now}-${randomUUID()}.json.gz`, data };
}

let s3; // the SDK is in Lambda's runtime; required here so the tests needn't have it
let table = {}, tableAt = 0; // config/versions.json, reread every 10 min
async function handler(event) {
  if (event.requestContext?.http?.method !== "POST") return { statusCode: 405 };
  const raw = event.isBase64Encoded ? Buffer.from(event.body ?? "", "base64").toString() : event.body;
  const games = new Set((process.env.GAMES ?? "").split(","));
  if (!raw || raw.length > MAX_BYTES) return { statusCode: 413 };
  const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
  s3 ??= new S3Client({});
  if (Date.now() - tableAt > 600000) {
    tableAt = Date.now();
    try {
      table = JSON.parse(await (await s3.send(new GetObjectCommand({ Bucket: process.env.BUCKET, Key: "config/versions.json" }))).Body.transformToString());
    } catch {}
  }
  const r = check(raw, games, Date.now(), table);
  if (r.status !== 200) return { statusCode: r.status };
  await s3.send(new PutObjectCommand({ Bucket: process.env.BUCKET, Key: r.key, Body: gzipSync(JSON.stringify(r.data)), ContentType: "application/gzip" }));
  return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ kept: r.data.events.length }) };
}

module.exports = { check, lookup, handler };
