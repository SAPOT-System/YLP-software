#!/usr/bin/env bash
# scripts/ca/sign-leaf.sh - sign a server CSR against an offline CA on a mounted USB stick.
#
# Runs ONLY on a dedicated offline signing laptop with the CA USB stick mounted. Never ship
# this script in a deployment bundle and never run it on a server; it is the only tool with
# a code path to server_ca.key. See scripts/build-bundle.sh for the guard that keeps it out
# of assembled bundles.
set -euo pipefail

usage() { echo "usage: $0 --ca-dir <mount> --csr <path> --out <path> [--days 825] [--yes]" >&2; exit 2; }

ca_dir= csr= out= days=825 assume_yes=false
while [ $# -gt 0 ]; do case "$1" in
  --ca-dir) ca_dir=${2:?}; shift 2;;
  --csr) csr=${2:?}; shift 2;;
  --out) out=${2:?}; shift 2;;
  --days) days=${2:?}; shift 2;;
  --yes) assume_yes=true; shift;;
  *) usage;;
esac; done
[ -n "$ca_dir" ] && [ -n "$csr" ] && [ -n "$out" ] || usage

ca_cert="$ca_dir/server_ca.pem"
ca_key="$ca_dir/server_ca.key"
ca_srl="$ca_dir/server_ca.srl"
ca_log="$ca_dir/issued-leaves.log"

[ -f "$csr" ] || { echo "CSR not found: $csr" >&2; exit 1; }
[ -f "$ca_cert" ] || { echo "CA cert not found: $ca_cert" >&2; exit 1; }
[ -f "$ca_key" ] || { echo "CA key not found: $ca_key" >&2; exit 1; }

# 1. Live-mount validation: refuse to sign against a stale mountpoint directory left behind
# by an unplugged drive. SAPOT_CA_ALLOW_LOCAL=1 is an env var (not a flag) deliberately, so
# it stays awkward to reach for out of habit; it exists only to test against a scratch CA.
if [ "${SAPOT_CA_ALLOW_LOCAL:-}" != "1" ]; then
  ca_dir_device=$(stat -c %d "$ca_dir")
  root_device=$(stat -c %d /)
  if [ "$ca_dir_device" = "$root_device" ]; then
    echo "refusing to sign: $ca_dir appears to be on the root filesystem, not a mounted CA USB stick (set SAPOT_CA_ALLOW_LOCAL=1 to override for testing)" >&2
    exit 1
  fi
fi

# 2. Print CA identity. This forces a real read through the mount (a dead mount fails here
# even if step 1 was fooled) and shows the operator which CA is about to sign. Always runs,
# even with --yes: informational, not a gate the operator can skip.
echo "CA identity:" >&2
openssl x509 -in "$ca_cert" -noout -subject -dates >&2

# 3. Parse and print the CSR's CN and SAN, then confirm. openssl req -text renders SAN as
# "IP Address:1.2.3.4, DNS:host" (human-readable); normalize to the "IP:1.2.3.4,DNS:host"
# form openssl's -extfile config syntax (and this repo's log format) actually expects.
cn=$(openssl req -in "$csr" -noout -subject | sed -n 's/.*CN *= *\([^,/]*\).*/\1/p')
san=$(openssl req -in "$csr" -noout -text \
  | awk '/X509v3 Subject Alternative Name/{getline; gsub(/^[ \t]+|[ \t]+$/, ""); print; exit}' \
  | sed -e 's/IP Address:/IP:/g' -e 's/, */,/g')

csr_sha256=$(sha256sum "$csr" | cut -d' ' -f1)

echo "CSR CN: $cn" >&2
echo "CSR SAN: ${san:-<none>}" >&2
echo "CSR sha256: $csr_sha256" >&2
echo "compare this digest against the one request-cert.sh printed on the server before confirming - a mismatch means the CSR was altered in transit" >&2

if [ -z "$san" ]; then
  echo "refusing to sign: CSR has no Subject Alternative Name. openssl x509 -req does not copy CSR extensions, so a SAN-less CSR would silently yield a CN-only cert that modern clients reject" >&2
  exit 1
fi

if ! "$assume_yes"; then
  read -r -p "Sign this CSR (CN=$cn, SAN=$san) for $days days? [y/N] " answer
  [[ "$answer" =~ ^[Yy]$ ]] || { echo "aborted: not signing" >&2; exit 1; }
fi

# 4. Sign via an extfile carrying the SAN forward plus leaf constraints. The extfile is written
# to a secure temp location and cleaned up on exit, never on the CA USB itself. out_written only
# flips true once $out itself has been written, and sign_ok only flips true after self-verify
# passes at step 6 - so the exit trap can undo a partial run (signing succeeded but the log
# append or self-verify failed after) without ever touching a pre-existing, unrelated $out left
# over from an earlier successful invocation.
extfile=$(mktemp)
tmp_out="$out.tmp.$$"
out_written=false
sign_ok=false
cleanup() {
  rm -f "$extfile" "$tmp_out"
  if "$out_written" && ! "$sign_ok"; then
    rm -f "$out"
  fi
}
trap cleanup EXIT

{
  printf 'subjectAltName=%s\n' "$san"
  printf 'basicConstraints=CA:FALSE\n'
  printf 'keyUsage=digitalSignature,keyEncipherment\n'
  printf 'extendedKeyUsage=serverAuth\n'
} > "$extfile"

rm -f "$tmp_out"
if ! openssl x509 -req -in "$csr" \
    -CA "$ca_cert" -CAkey "$ca_key" \
    -CAcreateserial -CAserial "$ca_srl" \
    -days "$days" \
    -extfile "$extfile" \
    -out "$tmp_out"; then
  echo "signing failed: not writing $out" >&2
  exit 1
fi
mv -f "$tmp_out" "$out"
out_written=true

# 5. Append one line to the CA USB's issued-leaves log; the recovery source if .srl is lost.
# Read the serial back out of the signed cert rather than re-reading .srl, to confirm what was
# actually stamped.
serial=$(openssl x509 -in "$out" -noout -serial | sed -n 's/^serial=//p')
fingerprint=$(openssl x509 -in "$out" -noout -fingerprint -sha256 | sed -n 's/^sha256 Fingerprint=//p')
timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
printf '%s serial=%s CN=%s SAN=%s days=%s out=%s sha256=%s\n' \
  "$timestamp" "$serial" "$cn" "$san" "$days" "$(basename "$out")" "$fingerprint" >> "$ca_log"

# 6. Self-verify before reporting success. On failure, the exit trap removes $out (sign_ok
# stays false) rather than handing back an unverified cert.
if ! openssl verify -CAfile "$ca_cert" "$out" >&2; then
  echo "verification failed: removed $out" >&2
  exit 1
fi
sign_ok=true

echo "signed and verified: $out" >&2
echo "SAN as read back from signed cert:" >&2
openssl x509 -in "$out" -noout -text | grep -A1 "Subject Alternative Name" >&2
