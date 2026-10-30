#!/bin/zsh
# One attempt: writes its request body to harness/bodies/<id>.json, sends it with ask.mjs (which logs it to
# ../runs/<id>.json, or $RUNS/<id>.json when RUNS is set), and prints the reply and its lookups. Stops at the first failure.
# usage: run.sh <id> <question> [history-json]
set -euo pipefail
cd ${0:A:h}
mkdir -p bodies
export RUNS=${RUNS:-../runs}
node -e 'const [id, q, h] = process.argv.slice(1); require("fs").writeFileSync(`bodies/${id}.json`, JSON.stringify({ question: q, history: h ? JSON.parse(h) : [], pins: true }))' "$1" "$2" "${3:-}"
node ask.mjs "$1" "bodies/$1.json" | sed -n '/REPLY:/,$p'
echo "--- tools:"
node -e 'const r = require(`./${process.env.RUNS}/${process.argv[1]}.json`); console.log(r.status, r.ms + "ms", JSON.stringify(r.tools.map((t) => (t.type === "data" ? { q: t.query, total: t.total, rows: t.rows } : t))))' "$1"
echo "=========="
