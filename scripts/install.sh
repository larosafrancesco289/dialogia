#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if command -v npm >/dev/null 2>&1; then
  npm ci || npm install
else
  echo "npm is required"
  exit 1
fi

