#!/usr/bin/env bash
# Build an immutable, transportable SAPOT deployment bundle on a connected host.
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo_root"

usage() {
  echo "usage: $0 [--release-policy PATH] [--low-disk]" >&2
  exit 2
}

policy=deploy/bundle-release-policy.json
low_disk=false
while [ "$#" -gt 0 ]; do
  case "$1" in
    --release-policy) policy=${2:?}; shift 2 ;;
    --low-disk) low_disk=true; shift ;;
    *) usage ;;
  esac
done

for command in arduino-cli docker python3 zstd sha256sum tar; do
  command -v "$command" >/dev/null || { echo "missing required command: $command" >&2; exit 1; }
done
docker compose version >/dev/null || { echo "Docker Compose v2 is required" >&2; exit 1; }
image_store_driver=$(docker info --format '{{range .DriverStatus}}{{if eq (index . 0) "driver-type"}}{{index . 1}}{{end}}{{end}}' 2>/dev/null || true)
[ "$image_store_driver" = io.containerd.snapshotter.v1 ] || {
  echo "Docker's containerd image store is required so bundle layers remain compressed" >&2
  exit 1
}
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "refusing to build from a dirty tracked worktree" >&2
  exit 1
fi

release_metadata=$(python3 scripts/validate_bundle_release.py --policy "$policy" --json)
readarray -t release_values < <(python3 - "$release_metadata" <<'PY'
import json
import sys

metadata = json.loads(sys.argv[1])
for key in ("version", "minimumUpgradeVersion", "minimumRollbackVersion"):
    print(metadata[key])
PY
)
version=${release_values[0]}
minimum_upgrade=${release_values[1]}
minimum_rollback=${release_values[2]}
output="dist/sapot-bundle-v$version.tar.zst"
[ ! -e "$output" ] || { echo "refusing to overwrite existing $output" >&2; exit 1; }

server_version=$(python3 -c "import ast; print(ast.literal_eval(open('server/app/version.py').read().split('=', 1)[1].strip()))")
admin_version=$(python3 -c "import json; print(json.load(open('admin-frontend/sapot-admin/package.json'))['version'])")
gsm_version=$(python3 -c "import ast; print(ast.literal_eval(open('GSM-module/GSM-fastapi/app_version.py').read().split('=', 1)[1].strip()))")
firmware_source=GSM-module/GSM-arduino-actual-code/GSM-arduino-actual-code.ino
firmware_version=$(sed -n 's/^#define FIRMWARE_VERSION "\([^"]*\)"/\1/p' "$firmware_source")
[ "$gsm_version" = "$firmware_version" ] || {
  echo "GSM service version ($gsm_version) does not match firmware version ($firmware_version)" >&2
  exit 1
}

map_metadata=tileserver/map-artifact.json
map_file=tileserver/osm-batangas.mbtiles
[ -f "$map_file" ] || {
  echo "missing $map_file; run tileserver/download-script.sh first" >&2
  exit 1
}
python3 tileserver/validate-map-artifact.py "$map_file" --metadata "$map_metadata"
readarray -t map_values < <(python3 - "$map_metadata" <<'PY'
import importlib.util, sys
spec = importlib.util.spec_from_file_location("map_validator", "tileserver/validate-map-artifact.py")
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
for key, value in module.load_contract(__import__("pathlib").Path(sys.argv[1])).items():
    if key in {"repository", "releaseTag", "assetName", "sha256", "size", "region", "bounds", "minZoom", "maxZoom", "scheme", "format"}:
        print(f"{key}={value}")
PY
)
declare -A map
for value in "${map_values[@]}"; do map[${value%%=*}]=${value#*=}; done

check_free_space() {
  minimum_free=${SAPOT_BUNDLE_MIN_FREE_BYTES:-10737418240}
  docker_root=$(docker info --format '{{.DockerRootDir}}')
  for path in "$repo_root" "$docker_root"; do
    available=$(df -PB1 "$path" | awk 'NR == 2 {print $4}')
    [ "$available" -ge "$minimum_free" ] || {
      echo "low-disk build requires at least $minimum_free free bytes on $path; found $available" >&2
      exit 1
    }
  done
}
"$low_disk" && check_free_space

git_sha=$(git rev-parse HEAD)
built_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
scratch=$(mktemp -d "$repo_root/.bundle-build.XXXXXX")
temporary_output=
cleanup() {
  rm -rf "$scratch"
  [ -z "$temporary_output" ] || rm -f "$temporary_output"
}
trap cleanup EXIT

bundle="$scratch/sapot-bundle-v$version"
mkdir -p "$bundle"/{images,compose,config,data,certs,firmware,scripts,systemd}
digest_file="$scratch/image-digests.tsv"
: > "$digest_file"

declare -A tags=(
  [api]="sapot/api:bundle-v$version"
  [admin]="sapot/admin:bundle-v$version"
  [gsm-fastapi]="sapot/gsm-fastapi:bundle-v$version"
  [arduino-flasher]="sapot/arduino-flasher:bundle-v$version"
  [mariadb]="sapot/mariadb:bundle-v$version"
  [redis]="sapot/redis:bundle-v$version"
  [nginx]="sapot/nginx:bundle-v$version"
  [tileserver-gl]="sapot/tileserver-gl:bundle-v$version"
)

save_image() {
  local name=$1 tag=$2 digest unpacked_size metadata
  local -a image_metadata
  local partial="$bundle/images/$name.tar.partial"
  local error_file="$scratch/$name.save.stderr"
  if ! docker save -o "$partial" "$tag" 2>"$error_file"; then
    if grep -qi 'ENOSPC\|no space left' "$error_file"; then
      echo "docker save ran out of disk space while writing $name" >&2
    fi
    rm -f "$partial" "$error_file"
    return 1
  fi
  rm -f "$error_file"
  metadata=$(python3 scripts/image_archive_metadata.py "$partial" "$tag")
  readarray -t image_metadata <<< "$metadata"
  digest=${image_metadata[0]}
  unpacked_size=${image_metadata[1]}
  mv "$partial" "$bundle/images/$name.tar"
  printf '%s\t%s\t%s\t%s\n' "$name" "$tag" "$digest" "$unpacked_size" >> "$digest_file"
}

cleanup_images() {
  "$low_disk" || return 0
  docker image rm "$@" >/dev/null 2>&1 || true
  docker builder prune --all --force >/dev/null
}

build_and_save() {
  local name=$1 context=$2 tag=${tags[$1]}
  docker build -t "$tag" "$context"
  save_image "$name" "$tag"
  cleanup_images "$tag"
  if "$low_disk"; then
    check_free_space
  fi
}

pull_and_save() {
  local name=$1 source=$2 tag=${tags[$1]}
  docker pull "$source"
  docker tag "$source" "$tag"
  save_image "$name" "$tag"
  cleanup_images "$tag" "$source"
  if "$low_disk"; then
    check_free_space
  fi
}

build_and_save api server
build_and_save admin admin-frontend/sapot-admin
build_and_save gsm-fastapi GSM-module/GSM-fastapi
build_and_save arduino-flasher deploy/docker/arduino-flasher
pull_and_save mariadb mariadb:11
pull_and_save redis redis:7-alpine
pull_and_save nginx nginx:1.27-alpine
pull_and_save tileserver-gl maptiler/tileserver-gl

fqbn=${GSM_ARDUINO_FQBN:-arduino:avr:uno}
arduino-cli core list | awk '{print $1}' | grep -qx 'arduino:avr' || {
  arduino-cli core update-index
  arduino-cli core install arduino:avr
}
arduino-cli compile --fqbn "$fqbn" --output-dir "$scratch/firmware-build" "$firmware_source"
hex=$(find "$scratch/firmware-build" -name '*.hex' -print -quit)
[ -n "$hex" ] || { echo "firmware compilation produced no .hex file" >&2; exit 1; }
cp "$hex" "$bundle/firmware/gsm-arduino-actual-code.hex"
cp "$firmware_source" "$bundle/firmware/gsm-arduino-actual-code.ino"
firmware_sha=$(sha256sum "$bundle/firmware/gsm-arduino-actual-code.hex" | awk '{print $1}')

python3 - docker-compose.prod.yml "$bundle/compose/docker-compose.yml" "$version" <<'PY'
from pathlib import Path
import sys

source, destination, version = sys.argv[1:]
text = Path(source).read_text(encoding="utf-8")
names = ("api", "admin", "gsm-fastapi", "arduino-flasher", "mariadb", "redis", "nginx", "tileserver-gl")
for name in names:
    text = text.replace(f"sapot/{name}:bundle", f"sapot/{name}:bundle-v{version}")
Path(destination).write_text(text, encoding="utf-8")
PY
cp docker-compose.gsm-hardware.yml "$bundle/compose/"
cp deploy/config/* "$bundle/config/"
cp "$map_file" "$bundle/data/"
cp -a server/static "$bundle/data/static"
cp docker/detect-ip.sh "$bundle/certs/"
cp -a deploy/scripts/. "$bundle/scripts/"
cp deployment-scripts/sapot-db-backup.service deployment-scripts/sapot-db-backup.timer "$bundle/systemd/"

check_no_ca_material() {
  local hit
  hit=$(find "$bundle" \( -name 'server_ca.key' -o -name 'server_ca.pem' -o -name 'gen-certs.sh' \) -print -quit)
  [ -z "$hit" ] || { echo "refusing to ship forbidden certificate material in bundle: $hit" >&2; exit 1; }
}
check_no_ca_material
chmod +x "$bundle/scripts"/*.sh "$bundle/scripts"/lib/*.sh "$bundle/scripts"/lib/*.py

python3 - "$bundle/manifest.json" "$version" "$git_sha" "$built_at" "$minimum_upgrade" "$minimum_rollback" "$server_version" "$admin_version" "$gsm_version" "$firmware_version" "$fqbn" "$firmware_sha" "${map[repository]}" "${map[releaseTag]}" "${map[assetName]}" "${map[sha256]}" "${map[size]}" "${map[region]}" "${map[bounds]}" "${map[minZoom]}" "${map[maxZoom]}" "${map[scheme]}" "${map[format]}" "$bundle" "$digest_file" <<'PY'
import json
import os
import subprocess
import sys

(
    out,
    version,
    sha,
    built,
    minimum_upgrade,
    minimum_rollback,
    server_version,
    admin_version,
    gsm_version,
    firmware_version,
    fqbn,
    firmware_sha,
    map_repository, map_release_tag, map_asset_name, map_sha, map_size, map_region,
    map_bounds, map_min_zoom, map_max_zoom, map_scheme, map_format,
    root,
    digest_file,
) = sys.argv[1:]

images = {}
with open(digest_file, encoding="utf-8") as lines:
    for line in lines:
        name, tag, digest, unpacked_size = line.rstrip("\n").split("\t")
        images[name] = {"tag": tag, "digest": digest, "unpackedSize": int(unpacked_size)}

required = sum(os.path.getsize(os.path.join(root, "images", f"{name}.tar")) for name in images)
for directory in ("data", "firmware"):
    required += sum(
        os.path.getsize(os.path.join(path, filename))
        for path, _, filenames in os.walk(os.path.join(root, directory))
        for filename in filenames
    )

def command(*args):
    try:
        return subprocess.check_output(args, text=True, stderr=subprocess.DEVNULL).strip()
    except Exception:
        return "unavailable"

manifest = {
    "schemaVersion": "2.0",
    "bundleId": f"{version}-{sha[:7]}-{built.replace('-', '').replace(':', '')}",
    "version": version,
    "gitSha": sha,
    "builtAt": built,
    "minimumUpgradeVersion": minimum_upgrade,
    "minimumRollbackVersion": minimum_rollback,
    "requiredDiskBytes": required,
    "componentVersions": {
        "server": server_version,
        "admin": admin_version,
        "gsmFastapi": gsm_version,
        "gsmFirmware": firmware_version,
    },
    "images": images,
    "mapData": {
        "repository": map_repository, "releaseTag": map_release_tag, "assetName": map_asset_name,
        "sha256": map_sha, "size": int(map_size), "region": map_region,
        "bounds": json.loads(map_bounds), "minZoom": int(map_min_zoom), "maxZoom": int(map_max_zoom),
        "scheme": map_scheme, "format": map_format,
    },
    "gsmFirmware": {
        "version": firmware_version,
        "board": "Arduino Uno",
        "fqbn": fqbn,
        "sha256": firmware_sha,
        "protocolVersion": "2",
        "compatibleGsmFastapiVersion": f"={gsm_version}",
    },
    "buildEnvironment": {
        "os": command("sh", "-c", ". /etc/os-release && echo $PRETTY_NAME"),
        "dockerEngineVersion": command("docker", "version", "--format", "{{.Server.Version}}"),
        "composeVersion": command("docker", "compose", "version", "--short"),
        "arduinoCliVersion": command("arduino-cli", "version"),
    },
}
with open(out, "w", encoding="utf-8") as output:
    json.dump(manifest, output, indent=2)
    output.write("\n")
PY

python3 - "$bundle/manifest.json" <<'PY'
import json
import sys

manifest = json.load(open(sys.argv[1], encoding="utf-8"))
required = {
    "schemaVersion", "bundleId", "version", "gitSha", "builtAt",
    "minimumUpgradeVersion", "minimumRollbackVersion", "requiredDiskBytes",
    "componentVersions", "images", "mapData", "gsmFirmware", "buildEnvironment",
}
expected_images = {"api", "admin", "gsm-fastapi", "arduino-flasher", "mariadb", "redis", "nginx", "tileserver-gl"}
if manifest.get("schemaVersion") != "2.0" or not required <= manifest.keys() or set(manifest["images"]) != expected_images:
    raise SystemExit("manifest does not satisfy schema 2.0")
PY

python3 - "$bundle/manifest.json" > "$bundle/BUILD_INFO.txt" <<'PY'
import json
import sys

manifest = json.load(open(sys.argv[1], encoding="utf-8"))
print(f"SAPOT bundle v{manifest['version']}")
print(f"Bundle ID: {manifest['bundleId']}")
print(f"Git SHA: {manifest['gitSha']}")
print(f"Built: {manifest['builtAt']}")
print("Components:")
for name, version in manifest["componentVersions"].items():
    print(f"  {name}: {version}")
print("Images:")
for name, image in manifest["images"].items():
    print(f"  {name}: {image['tag']} ({image['digest']})")
PY

check_no_ca_material
checksums="$scratch/CHECKSUMS.sha256"
(cd "$bundle" && find . -type f -print0 | sort -z | xargs -0 sha256sum > "$checksums")
mv "$checksums" "$bundle/CHECKSUMS.sha256"
python3 scripts/validate_extracted_bundle.py "$bundle" --version "$version" --commit "$git_sha" --metadata "$map_metadata"
mkdir -p dist
temporary_output="$output.tmp.$$"
tar -C "$scratch" -cf - "$(basename "$bundle")" | zstd -T0 -19 -o "$temporary_output"
python3 scripts/validate_archive_size.py "$temporary_output"
mv "$temporary_output" "$output"
temporary_output=
echo "built $output"
