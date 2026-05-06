#!/usr/bin/env bash
# launch.sh — start TTF, bootstrapping node_modules if needed
# Usage: ./scripts/launch.sh [port]
#   port defaults to 3000

set -e

PORT="${1:-3000}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CANONICAL="/home/jared/the-time-factory"

if [ ! -d "$ROOT/node_modules" ]; then
  if [ "$ROOT" != "$CANONICAL" ] && [ -d "$CANONICAL/node_modules" ]; then
    echo "→ Symlinking node_modules from $CANONICAL"
    ln -s "$CANONICAL/node_modules" "$ROOT/node_modules"
  else
    echo "→ Running npm install"
    npm --prefix "$ROOT" install
  fi
fi

echo "→ Starting TTF on port $PORT"
PORT="$PORT" node "$ROOT/server.js"
