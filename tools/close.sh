#!/usr/bin/env bash
# Closes Orbital Books: every page and API answers with the static "sorry, we
# can't do that for you right now" page (HTTP 503) until tools/open.sh runs.
# The server looks for the flag at most once a second, so no restart is needed.
# Usage: npm run close   (or tools/close.sh)
set -euo pipefail
cd "$(dirname "$0")/.."
data_dir="${ORBITAL_DATA_DIR:-.data}"
flag="$data_dir/closed"

mkdir -p "$data_dir"
date -u +"%Y-%m-%dT%H:%M:%SZ" > "$flag"
echo "Closed: made $flag. Within a second, every page answers 503 with the closed page."

# --- Remote step: not written yet --------------------------------------------
# Where the game is hosted isn't decided (Goldy asked David, 3 Nov 2026). Once it
# is, close the hosted copy here too, e.g. over ssh:
#   ssh <host> 'cd <app folder> && mkdir -p .data && touch .data/closed'
# or with the host's CLI, by setting ORBITAL_CLOSED=1 and redeploying.
echo "Remote: no hosted copy is set up yet, so only this machine was closed."
