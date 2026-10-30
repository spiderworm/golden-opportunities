#!/bin/zsh
# usage: run.sh <id> <question> [history-json]
cd ${0:A:h}
node -e 'const [,q,h]=process.argv.slice(1); require("fs").writeFileSync(`bodies/${process.argv[1]}.json`, JSON.stringify({question:q, history: h?JSON.parse(h):[], pins:true}))' "$1" "$2" "$3"
node ask.mjs "$1" "bodies/$1.json" | sed -n '/REPLY:/,$p'
echo "--- tools:"; node -e 'const r=require("./runs/'"$1"'.json"); console.log(r.status, r.ms+"ms", JSON.stringify(r.tools.map(t=>t.type==="data"?{q:t.query,total:t.total,rows:t.rows}:t)))'
echo "=========="
