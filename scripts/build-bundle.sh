#!/usr/bin/env bash
# Build an immutable, transportable SAPOT deployment bundle on a connected host.
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo_root"
usage() { echo "usage: $0 [--min-upgrade-version VERSION] [--max-rollback-version VERSION]" >&2; exit 2; }
min_version= max_version=
while [ $# -gt 0 ]; do case "$1" in
  --min-upgrade-version) min_version=${2:?}; shift 2;;
  --max-rollback-version) max_version=${2:?}; shift 2;;
  *) usage;; esac; done
for command in arduino-cli docker python3 zstd sha256sum tar; do command -v "$command" >/dev/null || { echo "missing required command: $command" >&2; exit 1; }; done
docker compose version >/dev/null || { echo "Docker Compose v2 is required" >&2; exit 1; }
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then echo "refusing to build from a dirty tracked worktree" >&2; exit 1; fi

version=$(python3 -c "import ast; print(ast.literal_eval(open('server/app/version.py').read().split('=', 1)[1].strip()))")
min_version=${min_version:-$version}; max_version=${max_version:-$version}
python3 deploy/scripts/lib/semver.py compare "$version" "$min_version" >/dev/null
python3 deploy/scripts/lib/semver.py compare "$version" "$max_version" >/dev/null
git_sha=$(git rev-parse HEAD); short_sha=$(git rev-parse --short HEAD); built_at=$(date -u +%Y-%m-%dT%H:%M:%SZ); build_stamp=$(date -u +%Y%m%dT%H%M%SZ)
scratch=$(mktemp -d "$repo_root/.bundle-build.XXXXXX")
trap 'rm -rf "$scratch"' EXIT
bundle="$scratch/sapot-bundle-v$version"
mkdir -p "$bundle"/{images,compose,config,data,certs,firmware,scripts}

declare -A tags=(
  [api]="sapot/api:bundle" [admin]="sapot/admin:bundle" [gsm-fastapi]="sapot/gsm-fastapi:bundle"
  [arduino-flasher]="sapot/arduino-flasher:bundle" [mariadb]="sapot/mariadb:bundle"
  [redis]="sapot/redis:bundle" [nginx]="sapot/nginx:bundle" [tileserver-gl]="sapot/tileserver-gl:bundle"
)
docker build -t "${tags[api]}" server
docker build -t "${tags[admin]}" admin-frontend/sapot-admin
docker build -t "${tags[gsm-fastapi]}" GSM-module/GSM-fastapi
docker build -t "${tags[arduino-flasher]}" deploy/docker/arduino-flasher
for pair in "mariadb:mariadb:11" "redis:redis:7-alpine" "nginx:nginx:1.27-alpine" "tileserver-gl:maptiler/tileserver-gl"; do
  name=${pair%%:*}; source_image=${pair#*:}; docker pull "$source_image"; docker tag "$source_image" "${tags[$name]}"
done
for name in "${!tags[@]}"; do docker save -o "$bundle/images/$name.tar" "${tags[$name]}"; done

cp tileserver/osm-batangas.mbtiles "$bundle/data/"
cp -a server/static "$bundle/data/static"
firmware_source=GSM-module/GSM-arduino-actual-code/GSM-arduino-actual-code.ino
fqbn=${GSM_ARDUINO_FQBN:-arduino:avr:uno}
arduino-cli compile --fqbn "$fqbn" --output-dir "$scratch/firmware-build" "$firmware_source"
hex=$(find "$scratch/firmware-build" -name '*.hex' -print -quit)
[ -n "$hex" ] || { echo "firmware compilation produced no .hex file" >&2; exit 1; }
cp "$hex" "$bundle/firmware/gsm-arduino-actual-code.hex"
cp "$firmware_source" "$bundle/firmware/gsm-arduino-actual-code.ino"
firmware_version=$(sed -n 's/^#define FIRMWARE_VERSION "\([^"]*\)"/\1/p' "$firmware_source")
firmware_sha=$(sha256sum "$bundle/firmware/gsm-arduino-actual-code.hex" | awk '{print $1}')

cp docker-compose.prod.yml "$bundle/compose/docker-compose.yml"
cp docker-compose.gsm-hardware.yml "$bundle/compose/"
cp deploy/config/* "$bundle/config/"
cp docker/gen-certs.sh docker/detect-ip.sh "$bundle/certs/"
cp -a deploy/scripts/. "$bundle/scripts/"
chmod +x "$bundle/scripts"/*.sh "$bundle/scripts"/lib/*.sh "$bundle/scripts"/lib/*.py

python3 - "$bundle/manifest.json" "$version" "$git_sha" "$built_at" "$min_version" "$max_version" "$firmware_version" "$fqbn" "$firmware_sha" "$bundle" <<'PY'
import json, os, subprocess, sys
out, version, sha, built, minimum, maximum, fw_version, fqbn, fw_sha, root = sys.argv[1:]
names = ["api", "admin", "gsm-fastapi", "arduino-flasher", "mariadb", "redis", "nginx", "tileserver-gl"]
images = {}
for name in names:
    tag = f"sapot/{name}:bundle"
    digest = subprocess.check_output(["docker", "image", "inspect", "--format", "{{.Id}}", tag], text=True).strip()
    images[name] = {"tag": tag, "digest": digest}
required = sum(os.path.getsize(os.path.join(root, "images", f"{name}.tar")) for name in names)
required += sum(os.path.getsize(os.path.join(path, file)) for path, _, files in os.walk(os.path.join(root, "data")) for file in files)
required += sum(os.path.getsize(os.path.join(path, file)) for path, _, files in os.walk(os.path.join(root, "firmware")) for file in files)
def command(*args):
    try: return subprocess.check_output(args, text=True, stderr=subprocess.DEVNULL).strip()
    except Exception: return "unavailable"
manifest = {"schemaVersion":"1.0", "bundleId": f"{version}-{sha[:7]}-{built.replace('-', '').replace(':', '')}", "version":version, "gitSha":sha, "builtAt":built, "minimumUpgradeVersion":minimum, "maximumRollbackVersion":maximum, "requiredDiskBytes":required, "images":images, "gsmFirmware":{"version":fw_version,"board":"Arduino Uno","fqbn":fqbn,"sha256":fw_sha,"protocolVersion":"2","compatibleGsmFastapiVersion":f">={version}"}, "buildEnvironment":{"os":command("sh", "-c", ". /etc/os-release && echo $PRETTY_NAME"), "dockerEngineVersion":command("docker", "version", "--format", "{{.Server.Version}}"), "composeVersion":command("docker", "compose", "version", "--short"), "arduinoCliVersion":command("arduino-cli", "version")}}
json.dump(manifest, open(out, "w", encoding="utf-8"), indent=2); print()
PY
python3 - "$bundle/manifest.json" <<'PY'
import json, sys
m=json.load(open(sys.argv[1])); required={"schemaVersion","bundleId","version","gitSha","builtAt","minimumUpgradeVersion","maximumRollbackVersion","requiredDiskBytes","images","gsmFirmware","buildEnvironment"}
if m.get("schemaVersion") != "1.0" or not required <= m.keys() or set(m["images"]) != {"api","admin","gsm-fastapi","arduino-flasher","mariadb","redis","nginx","tileserver-gl"}: raise SystemExit("manifest does not satisfy schema 1.0")
PY
python3 - "$bundle/manifest.json" > "$bundle/BUILD_INFO.txt" <<'PY'
import json, sys
m=json.load(open(sys.argv[1])); print(f"SAPOT bundle v{m['version']}\nBundle ID: {m['bundleId']}\nGit SHA: {m['gitSha']}\nBuilt: {m['builtAt']}")
print("Images:"); [print(f"  {n}: {i['tag']} ({i['digest']})") for n,i in m['images'].items()]
print(f"Firmware: {m['gsmFirmware']['version']} ({m['gsmFirmware']['fqbn']})")
PY
(cd "$bundle" && find . -type f ! -name CHECKSUMS.sha256 -print0 | sort -z | xargs -0 sha256sum > CHECKSUMS.sha256)
mkdir -p dist
tar -C "$scratch" -cf - "$(basename "$bundle")" | zstd -T0 -19 -o "dist/sapot-bundle-v$version.tar.zst"
echo "built dist/sapot-bundle-v$version.tar.zst"
