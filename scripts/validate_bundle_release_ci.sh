#!/usr/bin/env bash
# Validate every release precondition before a bundle build can begin.
set -euo pipefail
tag=${1:?tag is required}
workflow_commit=${2:?workflow commit is required}
main_ref=${3:?main ref is required}
notes_file=${4:?notes output is required}
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$root"
python3 scripts/validate_bundle_release.py --tag "$tag"
[[ "$(git cat-file -t "$tag")" = tag ]] || { echo "Bundle releases require an annotated tag." >&2; exit 1; }
tag_commit=$(git rev-parse "$tag^{}")
[[ "$tag_commit" = "$workflow_commit" ]] || { echo "workflow commit does not match the annotated tag commit" >&2; exit 1; }
version=${tag#bundle/v}
if [[ "$version" != *-* ]]; then
  git merge-base --is-ancestor "$tag_commit" "$main_ref" || { echo "Stable bundle tags must point to a commit on main." >&2; exit 1; }
fi
if [[ -n "${GEMINI_API_KEY:-}" ]]; then
  scripts/generate_release_notes.sh "$tag" "$notes_file"
else
  git for-each-ref --format='%(contents)' "refs/tags/$tag" > "$notes_file"
fi
[[ -s "$notes_file" ]] || { echo "Release notes are empty. Use an annotated bundle tag." >&2; exit 1; }
printf '%s\n' "$tag_commit"
