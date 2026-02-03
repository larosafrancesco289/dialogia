#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

bad_files=$(git ls-files | grep -E '(^|/)(\\.DS_Store|\\.env\\.local|vercel\\.env)$|(^|/)(node_modules|\\.next)/' || true)

if [[ -n "$bad_files" ]]; then
  echo "Repo hygiene check failed. Remove tracked local artifacts:"
  echo "$bad_files"
  exit 1
fi
