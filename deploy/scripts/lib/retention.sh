#!/usr/bin/env bash
set -euo pipefail

root=${SAPOT_ROOT:-/opt/sapot}
dry_run=false
keep=${SAPOT_RELEASE_RETENTION:-3}
log_days=${SAPOT_LOG_RETENTION_DAYS:-30}
[ "${1:-}" = "--dry-run" ] && dry_run=true
remove() { if "$dry_run"; then printf 'would remove %s\n' "$1"; else rm -rf -- "$1"; fi; }

mapfile -t releases < <(find "$root/releases" -mindepth 1 -maxdepth 1 -type d -name 'v*' -printf '%T@ %p\n' | sort -rn | awk '{print $2}')
for ((i=keep; i<${#releases[@]}; i++)); do
  release=${releases[$i]}
  mapfile -t image_tags < <(python3 - "$release/manifest.json" <<'PY'
import json, sys
for image in json.load(open(sys.argv[1]))["images"].values(): print(image["tag"])
PY
)
  remove "$release"
  for tag in "${image_tags[@]}"; do
    if ! grep -RqsF "\"tag\": \"$tag\"" "$root/releases"/v*/manifest.json 2>/dev/null; then
      "$dry_run" && printf 'would remove image %s\n' "$tag" || docker image rm "$tag" >/dev/null 2>&1 || true
    fi
  done
done
if [ -d "$root/shared/gsm-arduino-backups" ]; then
  find "$root/shared/gsm-arduino-backups" -type f -printf '%T@ %p\n' | sort -rn | tail -n +$((keep + 1)) | cut -d' ' -f2- | while read -r backup; do remove "$backup"; done
fi
if [ -d "$root/shared/logs" ]; then
  while IFS= read -r stale; do remove "$stale"; done < <(
    find "$root/shared/logs" -type f -mtime "+$log_days" -print
  )
fi
