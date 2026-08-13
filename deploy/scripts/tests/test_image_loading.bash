# shellcheck shell=bash

_make_image_fixture() {
  local release=$1 pinned=$2
  local config=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
  local oci_manifest=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  local staging="$release/staging"
  mkdir -p "$release/images" "$staging"
  printf '[{"Config":"blobs/sha256/%s","RepoTags":["sapot/api:test"],"Layers":[]}]\n' "$config" > "$staging/manifest.json"
  printf '{"schemaVersion":2,"manifests":[{"digest":"sha256:%s"}]}\n' "$oci_manifest" > "$staging/index.json"
  tar -C "$staging" -cf "$release/images/api.tar" manifest.json index.json
  printf '{"images":{"api":{"tag":"sapot/api:test","digest":"%s"}}}\n' "$pinned" > "$release/manifest.json"
}

_run_digest_verifier() (
  local release=$1 inspect_json=$2
  export TEST_DOCKER_INSPECT_JSON=$inspect_json
  docker() {
    printf '%s\n' "$TEST_DOCKER_INSPECT_JSON"
  }
  export -f docker
  "$SELF/../lib/verify-digests.sh" "$release/manifest.json"
)

test_digest_verifier_accepts_config_id_from_classic_store() {
  local dir; dir=$(mktemp -d); trap 'rm -rf "$dir"' RETURN
  local config=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
  _make_image_fixture "$dir" "$config"
  _run_digest_verifier "$dir" "[{\"Id\":\"$config\"}]" >/dev/null 2>&1
  assert_rc 0 $? 'classic Docker config ID accepted'
}

test_digest_verifier_accepts_manifest_id_from_containerd_store() {
  local dir; dir=$(mktemp -d); trap 'rm -rf "$dir"' RETURN
  local config=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
  local manifest=sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  _make_image_fixture "$dir" "$config"
  _run_digest_verifier "$dir" "[{\"Id\":\"$manifest\",\"Descriptor\":{\"digest\":\"$manifest\"}}]" >/dev/null 2>&1
  assert_rc 0 $? 'containerd OCI manifest ID accepted'
}

test_digest_verifier_rejects_unknown_identity() {
  local dir; dir=$(mktemp -d); trap 'rm -rf "$dir"' RETURN
  local config=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
  local unknown=sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
  _make_image_fixture "$dir" "$config"
  _run_digest_verifier "$dir" "[{\"Id\":\"$unknown\",\"Descriptor\":{\"digest\":\"$unknown\"}}]" >/dev/null 2>&1
  assert_rc 1 $? 'unrelated Docker image identity rejected'
}

test_digest_verifier_rejects_digest_absent_from_archive() {
  local dir; dir=$(mktemp -d); trap 'rm -rf "$dir"' RETURN
  local unknown=sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
  _make_image_fixture "$dir" "$unknown"
  _run_digest_verifier "$dir" "[{\"Id\":\"$unknown\"}]" >/dev/null 2>&1
  assert_rc 1 $? 'manifest digest must identify archive config or OCI manifest'
}

test_load_image_archive_rejects_successful_unpack_error() {
  (
    source "$SELF/../lib/deploy-common.sh"
    docker() {
      printf '%s\n' 'Loaded image: sapot/api:test'
      printf '%s\n' 'Error unpacking image sapot/api:test: no space left on device'
      return 0
    }
    load_image_archive /tmp/api.tar >/dev/null 2>&1
  )
  assert_rc 1 $? 'Docker unpack error rejected even when docker load exits zero'
}

_run_disk_preflight() (
  local free=$1 release=$2 target=$3 sapot_root=$4 docker_root=$5 containerd_root=$6
  export SAPOT_ROOT="$sapot_root" SAPOT_CONTAINERD_ROOT="$containerd_root"
  export TEST_DISK_FREE=$free TEST_DOCKER_ROOT=$docker_root
  source "$SELF/../lib/deploy-common.sh"
  docker() {
    if [[ "$*" = *DockerRootDir* ]]; then
      printf '%s\n' "$TEST_DOCKER_ROOT"
    else
      printf '%s\n' io.containerd.snapshotter.v1
    fi
  }
  df() {
    printf '%s\n' 'Filesystem 1B-blocks Used Available Use% Mounted on'
    printf '/dev/test 10000 0 %s 0%% /\n' "$TEST_DISK_FREE"
  }
  disk_preflight "$release" "$target" 1500 >/dev/null 2>&1
)

test_disk_preflight_aggregates_release_and_containerd_space() {
  local dir; dir=$(mktemp -d); trap 'rm -rf "$dir"' RETURN
  mkdir -p "$dir/release/images" "$dir/sapot" "$dir/docker" "$dir/containerd"
  truncate -s 1000 "$dir/release/images/api.tar"
  _run_disk_preflight 4199 "$dir/release" "$dir/sapot/releases/v1" "$dir/sapot" "$dir/docker" "$dir/containerd"
  assert_rc 1 $? 'combined release and image unpack estimate enforced'
  _run_disk_preflight 4200 "$dir/release" "$dir/sapot/releases/v1" "$dir/sapot" "$dir/docker" "$dir/containerd"
  assert_rc 0 $? 'combined estimate accepted at exact threshold'
}
