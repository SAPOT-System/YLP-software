#!/usr/bin/env bash
# scripts/release.sh - cut a component release tag.
# Usage: ./scripts/release.sh <mobile|server|admin|portal|gsm|bundle> <version>
set -euo pipefail

component="${1:-}"
version="${2:-}"
root="$(cd "$(dirname "$0")/.." && pwd)"

if [[ -z "$component" || -z "$version" ]]; then
  echo "Usage: ./scripts/release.sh <mobile|server|admin|portal|gsm|bundle> <X.Y.Z[-(alpha|beta|rc).N]>" >&2
  exit 1
fi

if [[ -n "$(git -C "$root" status --porcelain)" ]]; then
  echo "Working tree not clean - commit or stash first." >&2
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
  admin)
    if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-(alpha|beta|rc)\.[0-9]+)?$ ]]; then
      echo "Invalid version '$version' - expected X.Y.Z[-(alpha|beta|rc).N]" >&2
      exit 1
    fi
    (cd "$root/admin-frontend/sapot-admin" && pnpm version "$version" --no-git-tag-version --allow-same-version >/dev/null)
    git -C "$root" add admin-frontend/sapot-admin/package.json
    tag="admin/v$version" ;;
  portal)
    if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-(alpha|beta|rc)\.[0-9]+)?$ ]]; then
      echo "Invalid version '$version' - expected X.Y.Z[-(alpha|beta|rc).N]" >&2
      exit 1
    fi
    echo "$version" > "$root/captive-portal/VERSION"
    git -C "$root" add captive-portal/VERSION
    tag="portal/v$version" ;;
  gsm)
    python3 "$root/GSM-module/scripts/set_version.py" "$version"
    git -C "$root" add GSM-module/GSM-fastapi/app_version.py GSM-module/GSM-arduino-actual-code/GSM-arduino-actual-code.ino
    tag="gsm/v$version" ;;
  bundle)
    tag="bundle/v$version"
    if git -C "$root" rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
      echo "Tag $tag already exists - delete it first with: git tag -d $tag" >&2
      exit 1
    fi
    python3 "$root/scripts/validate_bundle_release.py" --candidate-version "$version"
    printf '%s\n' "$version" > "$root/deploy/VERSION"
    git -C "$root" add deploy/VERSION
    ;;
  *)
    echo "Unknown component '$component' (expected mobile|server|admin|portal|gsm|bundle)" >&2
    exit 1 ;;
esac

if git -C "$root" diff --cached --quiet; then
  echo "Version already at $version - skipping bump commit." >&2
else
  if [[ "$component" = bundle ]]; then
    git -C "$root" commit -m "chore(deploy-version): bump bundle to $version"
  else
    git -C "$root" commit -m "chore(version): $component $version"
  fi
fi

if git -C "$root" tag -l "$tag" | grep -q .; then
  echo "Tag $tag already exists - delete it first with: git tag -d $tag" >&2
  exit 1
fi
git -C "$root" tag -a "$tag" -m "$component $version"
echo "Created annotated tag $tag."
echo "Push it:  git push origin HEAD && git push origin $tag"
