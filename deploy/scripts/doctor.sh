#!/usr/bin/env bash
set -euo pipefail
SELF=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd); source "$SELF/lib/deploy-common.sh"
json=false; [ "${1:-}" = --json ] && json=true
current=$(readlink -f "$SAPOT_ROOT/releases/current" 2>/dev/null || true); [ -n "$current" ] || { log_error "SAPOT is not installed"; exit 1; }
check_schema "$current/manifest.json"
checks=(); failed=0
check() { local name=$1 status=$2 detail=$3; checks+=("$name|$status|$detail"); [ "$status" = PASS ] || failed=1; }
verify_checksums "$current" >/dev/null 2>&1 && check checksums PASS "release files match CHECKSUMS.sha256" || check checksums FAIL "release checksum mismatch"
"$VERIFY_DIGESTS" "$current/manifest.json" >/dev/null 2>&1 && check images PASS "loaded image digests match manifest" || check images FAIL "missing or mismatched image digest"
free=$(df -h "$SAPOT_ROOT" | awk 'NR==2 {print $4}'); check disk PASS "$free free on $SAPOT_ROOT"
hardware=$(manifest_value "$SAPOT_ROOT/shared/state.json" gsmHardwarePresent)
for service in db redis api admin gsm-fastapi tileserver nginx; do
  state=$(compose "$current" ps --format json "$service" 2>/dev/null | python3 -c 'import json,sys; x=json.load(sys.stdin); x=x[0] if isinstance(x,list) else x; print(x.get("Health") or x.get("State", "missing"))' 2>/dev/null || echo missing)
  if [ "$service" = nginx ]; then [ "$state" = running ] && check "$service" PASS up || check "$service" FAIL "$state"
  elif [ "$service" = gsm-fastapi ] && [ "$hardware" = false ] && [ "$state" = unhealthy ]; then check "$service" PASS "no modem attached, degraded health expected"
  elif [ "$state" = healthy ]; then check "$service" PASS healthy
  else check "$service" FAIL "$state"; fi
done
check_certificate() {
  local cert="$SAPOT_ROOT/shared/certs/server.crt"
  local key="$SAPOT_ROOT/shared/certs/server.key"
  if ! { [ -f "$cert" ] && openssl x509 -checkend 0 -noout -in "$cert" >/dev/null 2>&1; }; then
    check certificate FAIL "certificate missing or expired"; return
  fi
  local crt_pubkey key_pubkey
  crt_pubkey=$(openssl x509 -in "$cert" -noout -pubkey 2>/dev/null || true)
  key_pubkey=$(openssl pkey -in "$key" -pubout 2>/dev/null || true)
  if [ "$crt_pubkey" != "$key_pubkey" ]; then
    check certificate FAIL "certificate and key do not match"; return
  fi
  # The leaf must chain to the offline CA the mobile app pins. A self-signed
  # cert satisfies every check above and still fails on every production
  # handset, so this is the one that catches it.
  local anchor="$SAPOT_ROOT/shared/certs/server_ca.pem"
  if [ ! -f "$anchor" ]; then
    check certificate FAIL "no CA trust anchor at $anchor - reissue from the CA USB stick with request-cert.sh"; return
  fi
  if ! openssl verify -CAfile "$anchor" "$cert" >/dev/null 2>&1; then
    check certificate FAIL "certificate does not chain to $anchor - reissue from the CA USB stick with request-cert.sh"; return
  fi
  local san ip
  san=$(openssl x509 -in "$cert" -noout -text 2>/dev/null | grep -A1 "Subject Alternative Name" || true)
  if [[ "$san" != *"$SAPOT_SERVER_DNS_NAME"* ]]; then
    check certificate FAIL "certificate SAN does not cover $SAPOT_SERVER_DNS_NAME - mobile preview/production builds will fail TLS hostname verification"; return
  fi
  ip=$("$current/certs/detect-ip.sh" 2>/dev/null || true)
  if [ -n "$ip" ] && [[ "$san" != *"$ip"* ]]; then
    check certificate FAIL "certificate SAN does not cover detected LAN IP $ip"; return
  fi
  check certificate PASS "certificate is current"
}
check_certificate
for port in 80 443; do ss -ltn "sport = :$port" | grep -q LISTEN && check "port-$port" PASS bound || check "port-$port" FAIL not-bound; done
if [ "$hardware" = true ]; then port=$(grep '^GSM_ARDUINO_PORT=' "$SAPOT_ROOT/shared/gsm-arduino.env" | cut -d= -f2-); [ -c "$port" ] && check gsm-device PASS "$port present" || check gsm-device FAIL "$port missing"; fi
if "$json"; then printf '%s\n' "${checks[@]}" | python3 -c 'import json,sys; print(json.dumps([dict(zip(("check","status","detail"), line.rstrip().split("|",2))) for line in sys.stdin]))'
else for row in "${checks[@]}"; do IFS='|' read -r name state detail <<< "$row"; [ "$state" = PASS ] && log_pass "$name: $detail" || log_fail "$name: $detail"; done; fi
exit "$failed"
