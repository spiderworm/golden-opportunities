#!/usr/bin/env bash
# Copies the games-studio shared packages Orbital Books uses into packages/,
# and records the studio commit they came from in packages/STUDIO_SOURCE.md.
# Usage: tools/sync-studio-packages.sh [path to a games-studio checkout]
set -euo pipefail

studio="${1:-$HOME/Projects/games-studio/research}"
here="$(cd "$(dirname "$0")/.." && pwd)"
packages=(music analytics platform kit)

if [ -n "$(git -C "$studio" status --porcelain -- "${packages[@]/#/packages/}")" ]; then
  echo "The studio's packages have uncommitted changes in $studio; commit them first." >&2
  exit 1
fi
commit="$(git -C "$studio" rev-parse HEAD)"

for p in "${packages[@]}"; do
  rsync -a --delete --exclude node_modules --exclude android --exclude package-lock.json \
    "$studio/packages/$p/" "$here/packages/$p/"
done

cat > "$here/packages/STUDIO_SOURCE.md" <<MD
# Studio packages

The folders here are copies of David's existing games-studio packages, not code written for Orbital Books.
They're refreshed with \`tools/sync-studio-packages.sh\`; don't edit them here.

- Source: games-studio, commit \`$commit\`
- Packages: ${packages[*]}
- Copied: $(date -u +%Y-%m-%dT%H:%M:%SZ)
MD
echo "Copied ${packages[*]} from $commit"
