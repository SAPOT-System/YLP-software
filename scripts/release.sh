#!/usr/bin/env bash
# scripts/release.sh — cut a component release tag with notes.
# Usage: ./scripts/release.sh <mobile|server> <version>
set -euo pipefail

component="${1:-}"
version="${2:-}"
root="$(cd "$(dirname "$0")/.." && pwd)"

if [[ -z "$component" || -z "$version" ]]; then
  echo "Usage: ./scripts/release.sh <mobile|server> <X.Y.Z[-(alpha|beta|rc).N]>" >&2
  exit 1
fi

if [[ -n "$(git -C "$root" status --porcelain)" ]]; then
  echo "Working tree not clean — commit or stash first." >&2
  exit 1
fi

case "$component" in
  mobile)
    (cd "$root/mobile-app/sapot-mobile-app" && node scripts/set-version.js "$version")
    git -C "$root" add mobile-app/sapot-mobile-app/package.json mobile-app/sapot-mobile-app/app.config.ts
    tag="mobile/v$version" ;;
  server)
    python3 "$root/server/scripts/set_version.py" "$version"
    git -C "$root" add server/app/version.py
    tag="server/v$version" ;;
  *)
    echo "Unknown component '$component' (expected mobile|server)" >&2
    exit 1 ;;
esac

git -C "$root" commit -m "chore(version): $component $version"

# Draft notes locally: Claude (sonnet) if ANTHROPIC_API_KEY is set and the SDK is
# installed; otherwise the template for you to fill in. Review before tagging.
notes="$(mktemp)"
node "$root/scripts/release-notes.mjs" "$component" "$tag" > "$notes"
if [[ -t 0 && -n "${EDITOR:-}" ]]; then
  "$EDITOR" "$notes"
else
  echo "Review/edit the drafted notes at: $notes" >&2
fi

git -C "$root" tag -a "$tag" -F "$notes"
rm -f "$notes"
echo "Created annotated tag $tag (notes embedded in the tag message)."
echo "Push it:  git push origin HEAD && git push origin $tag"
