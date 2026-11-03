#!/usr/bin/env bash
# Reopens Orbital Books after tools/close.sh: removes the flag, and the game is
# back within a second. ORBITAL_CLOSED=1 in the server's environment still
# keeps it closed; that one needs a restart without it.
# Usage: npm run open   (or tools/open.sh)
set -euo pipefail
cd "$(dirname "$0")/.."
# The server reads ORBITAL_DATA_DIR from the folder it was started in. npm start
# and npm run dev start in this repo's folder, so a relative path is taken from
# here; if your server starts elsewhere, give an absolute ORBITAL_DATA_DIR.
data_dir="${ORBITAL_DATA_DIR:-.data}"
case "$data_dir" in /*) ;; *) data_dir="$PWD/$data_dir" ;; esac
flag="$data_dir/closed"

if [ -e "$flag" ]; then
  rm "$flag"
  echo "Opened: removed $flag. Within a second, the game is back."
else
  echo "Already open: there was no $flag."
fi

# --- Remote step: not written yet --------------------------------------------
# Where the game is hosted isn't decided (Goldy asked David, 3 Nov 2026). Once it
# is, reopen the hosted copy here too, e.g. over ssh:
#   ssh <host> 'cd <app folder> && rm -f .data/closed'
# or with the host's CLI, by clearing ORBITAL_CLOSED and redeploying.
echo "Remote: no hosted copy is set up yet, so only this machine was opened."
