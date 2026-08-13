#!/usr/bin/env bash
# Atomically stage and verify both bundle assets before publishing a draft release.
set -euo pipefail
repository=${1:?repository}; tag=${2:?tag}; version=${3:?version}; commit=${4:?commit}; notes=${5:?notes}; archive=${6:?archive}; checksum=${7:?checksum}
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
source "$root/scripts/lib/github-api.sh"
[[ -n "${SAPOT_RELEASE_POLICY_TOKEN:-}" ]] || { echo "missing SAPOT_RELEASE_POLICY_TOKEN" >&2; exit 1; }
for command in "verify" "verify-asset"; do gh release --help | grep -Eq "(^|[[:space:]])$command(:|[[:space:]]|$)" || { echo "installed gh lacks gh release $command" >&2; exit 1; }; done
check_immutable() { GH_TOKEN="$SAPOT_RELEASE_POLICY_TOKEN" github_api "repos/$repository/immutable-releases" --jq '.enabled' | grep -qx true; }
check_immutable || { echo "repository immutable releases must be enabled" >&2; exit 1; }
[[ -f "$archive" && -f "$checksum" && -f "$notes" ]] || { echo "release inputs are missing" >&2; exit 1; }
archive_name=$(basename "$archive"); checksum_name=$(basename "$checksum")
archive_sha=$(sha256sum "$archive" | awk '{print $1}')
[[ "$(wc -l < "$checksum" | tr -d ' ')" = 1 ]] && [[ "$(<"$checksum")" = "$archive_sha  $archive_name" ]] || { echo "checksum file must contain exactly the archive digest and basename" >&2; exit 1; }
encoded_tag=$(python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$tag")
remote_commit=$(github_api "repos/$repository/git/ref/tags/$encoded_tag" --jq .object.sha)
[[ "$(github_api "repos/$repository/git/tags/$remote_commit" --jq .object.sha)" = "$commit" ]] || { echo "remote annotated tag does not match build commit" >&2; exit 1; }
existing=$(github_api "repos/$repository/releases" --paginate --jq ".[] | select(.tag_name == \"$tag\")" | head -n 1)
if [[ -n "$existing" ]]; then
  [[ "$(python3 -c 'import json,sys; print(json.load(sys.stdin)["draft"])' <<<"$existing")" = True ]] || { echo "published release exists" >&2; exit 1; }
  release_id=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])' <<<"$existing")
else
  args=(release create "$tag" --verify-tag --draft --title "$tag" --notes-file "$notes")
  [[ "$version" == *-* ]] && args+=(--prerelease)
  gh "${args[@]}" >/dev/null
  for i in {1..15}; do
    release_id=$(github_api "repos/$repository/releases" --paginate --jq ".[] | select(.tag_name == \"$tag\") | .id" | head -n 1)
    [[ -n "$release_id" ]] && break
    sleep 2
  done
  [[ -n "$release_id" ]] || { echo "failed to retrieve release ID after creation" >&2; exit 1; }
fi
assets=$(github_api "repos/$repository/releases/$release_id/assets")
for id in $(ASSETS="$assets" python3 - "$archive_name" "$checksum_name" <<'PY'
import json,os,sys
names=set(sys.argv[1:]); print(*[a['id'] for a in json.loads(os.environ['ASSETS']) if a['name'] in names])
PY
); do github_api -X DELETE "repos/$repository/releases/assets/$id"; done
gh release upload "$tag" "$archive" "$checksum"
assets=$(github_api "repos/$repository/releases/$release_id/assets")
ASSETS="$assets" python3 - "$archive_name" "$checksum_name" "$archive_sha" <<'PY'
import json, os, sys
assets=json.loads(os.environ['ASSETS']); expected={sys.argv[1],sys.argv[2]}
found={a['name']:a for a in assets if a['name'] in expected}
if set(found) != expected or any(a.get('state') != 'uploaded' for a in found.values()): raise SystemExit('both release assets must be uploaded exactly once')
if found[sys.argv[1]].get('digest') != 'sha256:'+sys.argv[3]: raise SystemExit('archive digest mismatch')
PY
check_immutable || { echo "repository immutable releases were disabled before publication" >&2; exit 1; }
github_api -X PATCH "repos/$repository/releases/$release_id" -f draft=false >/dev/null
verified=false
for i in {1..15}; do
  if gh release verify "$tag" --repo "$repository"; then
    verified=true
    break
  fi
  sleep 2
done
if [[ "$verified" != true ]]; then
  echo "failed to verify release attestations after 30s" >&2
  exit 1
fi
gh release verify-asset "$tag" "$archive_name" --repo "$repository"
gh release verify-asset "$tag" "$checksum_name" --repo "$repository"
