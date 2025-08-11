#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

export NODE_OPTIONS=${NODE_OPTIONS:-""}

npm run dev

