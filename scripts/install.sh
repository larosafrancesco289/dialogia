#!/usr/bin/env bash
set -euo pipefail

BUN_BIN=$(command -v bun || command -v ~/.bun/bin/bun || true)

if [ -z "$BUN_BIN" ]; then
  echo "bun is required"
  exit 1
fi

cd "$(dirname "$0")/.."

"$BUN_BIN" install --frozen-lockfile
