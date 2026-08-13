#!/usr/bin/env bash
set -euo pipefail

manifest=${1:?usage: verify-digests.sh <manifest.json>}
release=$(cd "$(dirname "$manifest")" && pwd)
failed=0
if ! identities=$(python3 - "$manifest" "$release" <<'PY'
import json
import pathlib
import sys
import tarfile

manifest_path, release = sys.argv[1:]
images = json.load(open(manifest_path, encoding="utf-8"))["images"]
for name, image in images.items():
    archive_path = pathlib.Path(release, "images", f"{name}.tar")
    with tarfile.open(archive_path) as archive:
        docker_manifest = json.load(archive.extractfile("manifest.json"))
        index = json.load(archive.extractfile("index.json"))
    entries = [entry for entry in docker_manifest if image["tag"] in entry.get("RepoTags", [])]
    if len(entries) != 1:
        raise SystemExit(f"cannot resolve {image['tag']} in {archive_path}")
    archive_config = "sha256:" + pathlib.PurePosixPath(entries[0]["Config"]).name
    descriptors = index.get("manifests", [])
    if len(descriptors) != 1 or not descriptors[0].get("digest"):
        raise SystemExit(f"cannot resolve OCI manifest digest in {archive_path}")
    archive_manifest = descriptors[0]["digest"]
    if image["digest"] not in {archive_config, archive_manifest}:
        raise SystemExit(
            f"image digest mismatch inside {archive_path}: manifest has {image['digest']}, "
            f"archive has config {archive_config} and OCI manifest {archive_manifest}"
        )
    print(name, image["tag"], archive_config, archive_manifest, sep="\t")
PY
); then
  exit 1
fi

while IFS=$'\t' read -r name tag config_digest manifest_digest; do
  inspect=$(docker image inspect "$tag" 2>/dev/null || true)
  if [ -z "$inspect" ] || [ "$inspect" = '[]' ]; then
    printf 'missing image %s (%s)\n' "$name" "$tag" >&2
    failed=1
    continue
  fi
  read -r actual_id actual_manifest < <(python3 -c '
import json, sys
image = json.load(sys.stdin)[0]
print(image.get("Id", ""), image.get("Descriptor", {}).get("digest", ""))
' <<< "$inspect")
  if [ "$actual_id" != "$config_digest" ] && [ "$actual_manifest" != "$manifest_digest" ]; then
    printf 'image identity mismatch for %s: expected config %s or manifest %s, got ID %s and manifest %s\n' \
      "$name" "$config_digest" "$manifest_digest" "${actual_id:-unavailable}" "${actual_manifest:-unavailable}" >&2
    failed=1
  fi
done <<< "$identities"
exit "$failed"
