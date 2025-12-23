#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

bun run lint:types
bun run test
bun run format
