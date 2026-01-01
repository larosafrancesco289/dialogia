#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

scripts/hygiene.sh
bun run lint:types
bun run test
bun run format:check
bun run lint
