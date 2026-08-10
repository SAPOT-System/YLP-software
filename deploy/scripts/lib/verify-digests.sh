#!/usr/bin/env bash
set -euo pipefail

manifest=${1:?usage: verify-digests.sh <manifest.json>}
failed=0
while IFS=$'\t' read -r name tag digest; do
  actual=$(docker image inspect --format '{{.Id}}' "$tag" 2>/dev/null || true)
  if [ -z "$actual" ]; then
    printf 'missing image %s (%s)\n' "$name" "$tag" >&2
    failed=1
  elif [ "$actual" != "$digest" ]; then
    printf 'digest mismatch for %s: expected %s, got %s\n' "$name" "$digest" "$actual" >&2
    failed=1
  fi
done < <(python3 - "$manifest" <<'PY'
import json, sys
for name, image in json.load(open(sys.argv[1], encoding="utf-8"))["images"].items():
    print(f"{name}\t{image['tag']}\t{image['digest']}")
PY
)
exit "$failed"
