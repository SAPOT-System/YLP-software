#!/usr/bin/env bash
# Download the reviewed, immutable Batangas map release without transforming it.
set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(cd "$script_dir/.." && pwd)
metadata="$script_dir/map-artifact.json"
if [[ "${1:-}" = "--metadata" ]]; then
  metadata=${2:?missing metadata path}
  shift 2
fi
[[ $# -eq 0 ]] || { echo "usage: $0 [--metadata PATH]" >&2; exit 2; }
command -v gh >/dev/null || { echo "missing required command: gh" >&2; exit 1; }
source "$repo_root/scripts/lib/github-api.sh"

readarray -t values < <(python3 - "$metadata" <<'PY'
import importlib.util, sys
spec = importlib.util.spec_from_file_location("map_validator", "tileserver/validate-map-artifact.py")
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
contract = module.load_contract(__import__("pathlib").Path(sys.argv[1]))
for key in ("repository", "releaseTag", "assetName", "sha256"):
    print(contract[key])
PY
)
repository=${values[0]}; release_tag=${values[1]}; asset_name=${values[2]}; expected_sha=${values[3]}
encoded_tag=$(python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$release_tag")

immutable=$(github_api "repos/$repository/immutable-releases" --jq '.enabled')
[[ "$immutable" = true ]] || { echo "map release requires repository immutable releases to be enabled" >&2; exit 1; }
release=$(github_api "repos/$repository/releases/tags/$encoded_tag" 2>/dev/null) || { echo "map release $release_tag was not found" >&2; exit 1; }
RELEASE_JSON="$release" python3 - "$asset_name" "$expected_sha" <<'PY'
import json, os, sys
asset_name, expected_sha = sys.argv[1:]
release = json.loads(os.environ["RELEASE_JSON"])
if release.get("draft") or not release.get("published_at"):
    raise SystemExit("map release must be published")
assets = [asset for asset in release.get("assets", []) if asset.get("name") == asset_name]
if len(assets) != 1:
    raise SystemExit("map release must contain exactly one expected asset")
asset = assets[0]
if asset.get("state") != "uploaded": raise SystemExit("map asset is not uploaded")
if asset.get("digest") != f"sha256:{expected_sha}": raise SystemExit("map asset digest does not match metadata")
PY

destination="$script_dir/$asset_name"
if [[ -f "$destination" ]] && python3 "$script_dir/validate-map-artifact.py" "$destination" --metadata "$metadata"; then
  echo "validated cached $destination"
  exit 0
fi
rm -f "$destination"
temporary_directory=$(mktemp -d "$script_dir/.map-download.XXXXXX")
cleanup() { rm -rf "$temporary_directory"; }
trap cleanup EXIT
gh release download "$release_tag" --repo "$repository" --pattern "$asset_name" --dir "$temporary_directory"
candidate="$temporary_directory/$asset_name"
python3 "$script_dir/validate-map-artifact.py" "$candidate" --metadata "$metadata"
mv "$candidate" "$destination"
echo "downloaded and validated $destination"
