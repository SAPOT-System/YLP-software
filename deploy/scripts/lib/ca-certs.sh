#!/usr/bin/env bash

# Offline-CA leaf issuance, performed on the server against a CA USB stick
# plugged into this host.
#
# Trust model: the CA private key lives only on a removable USB stick and is
# readable on this host solely for the duration of an issuance run. Nothing
# here copies it to disk - only the public server_ca.pem is retained, as the
# trust anchor doctor.sh verifies the leaf against. Unplug the stick when the
# run finishes.
#
# Sourced by deploy-common.sh. install.sh and request-cert.sh both already hold
# the deploy lock when they call in, so nothing here acquires it.

# 825 days is the maximum leaf lifetime iOS and Chrome accept.
SAPOT_CA_LEAF_DAYS=${SAPOT_CA_LEAF_DAYS:-825}

# Where an auto-mounted USB stick shows up across the desktop and headless
# distros this is deployed on. Held as literal patterns, not pre-expanded paths,
# so the glob runs at search time. SAPOT_CA_DIR overrides the search entirely.
SAPOT_CA_SEARCH_GLOBS=('/media/*/*' '/media/*' '/run/media/*/*' '/mnt/*/*' '/mnt/*')

# Runs an openssl command, holding its stderr back and printing it only if the
# command actually fails. Key generation and signing emit progress dots and
# "Certificate request self-signature ok" chatter that buries the log lines an
# operator needs to read during an install, but the same stream carries the
# reason on failure - so it is withheld, not discarded.
_ca_quiet() {
  local log rc=0
  log=$(mktemp) || return 1
  "$@" 2>"$log" || rc=$?
  [ "$rc" -eq 0 ] || cat "$log" >&2
  rm -f "$log"
  return "$rc"
}

# Prints the directory holding server_ca.pem + server_ca.key. Stdout carries the
# path and nothing else, so callers can capture it; every message goes to stderr.
ca_find_dir() {
  if [ -n "${SAPOT_CA_DIR:-}" ]; then
    printf '%s\n' "$SAPOT_CA_DIR"
    return 0
  fi
  local candidates=() glob dir
  for glob in "${SAPOT_CA_SEARCH_GLOBS[@]}"; do
    for dir in $glob; do  # deliberately unquoted - this is where the glob expands
      [ -d "$dir" ] || continue
      [ -f "$dir/server_ca.pem" ] && [ -f "$dir/server_ca.key" ] || continue
      candidates+=("$dir")
    done
  done
  case ${#candidates[@]} in
    1) printf '%s\n' "${candidates[0]}"; return 0;;
    0)
      log_error "no CA USB stick found - looked for a directory containing both server_ca.pem and server_ca.key under: ${SAPOT_CA_SEARCH_GLOBS[*]}"
      log_error "plug in the CA USB stick and confirm it is mounted (lsblk -f), or point SAPOT_CA_DIR at its mountpoint"
      return 1;;
    *)
      log_error "found ${#candidates[@]} candidate CA directories: ${candidates[*]}"
      log_error "set SAPOT_CA_DIR to the one to sign with, so the choice is explicit"
      return 1;;
  esac
}

# Confirms the directory really is a mounted CA USB stick carrying usable CA
# material, and prints the CA's identity so the operator sees which CA is about
# to sign. Every failure here happens before any key or CSR is generated.
ca_verify_dir() {
  local ca_dir=$1
  local ca_cert="$ca_dir/server_ca.pem" ca_key="$ca_dir/server_ca.key"
  [ -d "$ca_dir" ] || { log_error "CA directory not found: $ca_dir"; return 1; }
  [ -f "$ca_cert" ] || { log_error "CA certificate not found: $ca_cert"; return 1; }
  [ -f "$ca_key" ] || { log_error "CA private key not found: $ca_key"; return 1; }

  # A live mount sits on its own device; matching / means the drive was never
  # mounted or was unplugged and left a stale mountpoint directory behind.
  # SAPOT_CA_ALLOW_LOCAL=1 is an env var rather than a flag deliberately, so it
  # stays awkward to reach for out of habit - it exists only to let CI and
  # manual testing sign against a scratch CA in a temp directory.
  if [ "${SAPOT_CA_ALLOW_LOCAL:-}" != 1 ] && [ "$(stat -c %d "$ca_dir")" = "$(stat -c %d /)" ]; then
    log_error "refusing to sign: $ca_dir is on the root filesystem, not a mounted CA USB stick (set SAPOT_CA_ALLOW_LOCAL=1 to override for testing)"
    return 1
  fi

  # Signing appends to server_ca.srl and issued-leaves.log on the stick. Catch a
  # read-only mount now rather than half way through openssl.
  [ -w "$ca_dir" ] || {
    log_error "CA USB stick at $ca_dir is not writable - the serial file and issued-leaves.log cannot be updated; remount it read-write"
    return 1
  }

  # Reading through the mount also catches a dead mount the device check missed.
  local ca_text
  ca_text=$(openssl x509 -in "$ca_cert" -noout -text 2>/dev/null) || {
    log_error "cannot parse $ca_cert as a certificate"
    return 1
  }
  [[ "$ca_text" == *"CA:TRUE"* ]] || {
    log_error "$ca_cert is not a CA certificate (basicConstraints lacks CA:TRUE) - this is not the SAPOT root CA"
    return 1
  }
  openssl x509 -checkend 0 -noout -in "$ca_cert" >/dev/null 2>&1 || {
    log_error "$ca_cert has expired - a leaf signed by it would be rejected; the CA itself must be re-issued and the mobile app rebuilt"
    return 1
  }
  local ca_cert_pubkey ca_key_pubkey
  ca_cert_pubkey=$(openssl x509 -in "$ca_cert" -noout -pubkey 2>/dev/null || true)
  ca_key_pubkey=$(openssl pkey -in "$ca_key" -pubout 2>/dev/null || true)
  [ -n "$ca_cert_pubkey" ] && [ "$ca_cert_pubkey" = "$ca_key_pubkey" ] || {
    log_error "$ca_key does not match $ca_cert - mismatched CA material on the stick"
    return 1
  }

  log_info "signing CA: $(openssl x509 -in "$ca_cert" -noout -subject | sed 's/^subject=//')"
  log_info "CA validity: $(openssl x509 -in "$ca_cert" -noout -dates | tr '\n' ' ')"
}

# Signs a CSR into <out>, leaving <out> untouched unless the new leaf verifies
# against the CA. Called only with a CSR this host just generated. <log_name> is
# the name recorded in issued-leaves.log; callers signing into a staging path
# pass the destination the leaf will end up at, so the log names something the
# operator can actually find later.
ca_sign_csr() {
  local ca_dir=$1 csr=$2 out=$3 log_name=${4:-$(basename "$3")}
  local ca_cert="$ca_dir/server_ca.pem" ca_key="$ca_dir/server_ca.key"
  local ca_srl="$ca_dir/server_ca.srl" ca_log="$ca_dir/issued-leaves.log"

  # openssl x509 -req does not copy extensions from the CSR, so the SAN has to
  # be read back out and passed forward explicitly or the leaf comes out CN-only
  # and every modern client rejects it. openssl renders the SAN as
  # "IP Address:1.2.3.4, DNS:host"; normalise to the "IP:1.2.3.4,DNS:host" form
  # -extfile expects.
  local cn san
  cn=$(openssl req -in "$csr" -noout -subject | sed -n 's/.*CN *= *\([^,/]*\).*/\1/p')
  san=$(openssl req -in "$csr" -noout -text \
    | awk '/X509v3 Subject Alternative Name/{getline; gsub(/^[ \t]+|[ \t]+$/, ""); print; exit}' \
    | sed -e 's/IP Address:/IP:/g' -e 's/, */,/g')
  [ -n "$san" ] || {
    log_error "refusing to sign: $csr has no Subject Alternative Name"
    return 1
  }
  [[ "$san" == *"$SAPOT_SERVER_DNS_NAME"* ]] || {
    log_error "refusing to sign: CSR SAN ($san) does not cover $SAPOT_SERVER_DNS_NAME - mobile preview/production builds scope their CA pin to that name and would fail TLS hostname verification"
    return 1
  }

  local extfile="$out.ext.$$" tmp_out="$out.tmp.$$"
  # A short write here would silently yield a leaf missing its SAN or leaf
  # constraints, so the write is checked rather than assumed.
  if ! {
    printf 'subjectAltName=%s\n' "$san"
    printf 'basicConstraints=CA:FALSE\n'
    printf 'keyUsage=digitalSignature,keyEncipherment\n'
    printf 'extendedKeyUsage=serverAuth\n'
  } > "$extfile"; then
    rm -f "$extfile"
    log_error "could not write certificate extensions to $extfile"
    return 1
  fi

  if ! _ca_quiet openssl x509 -req -in "$csr" \
      -CA "$ca_cert" -CAkey "$ca_key" \
      -CAcreateserial -CAserial "$ca_srl" \
      -days "$SAPOT_CA_LEAF_DAYS" \
      -extfile "$extfile" \
      -out "$tmp_out"; then
    rm -f "$extfile" "$tmp_out"
    log_error "signing failed - $out left untouched"
    return 1
  fi
  rm -f "$extfile"

  # Verify before publishing rather than after: $out is only replaced once the
  # new leaf is known to chain to the CA, so a bad signature can never leave a
  # broken cert where the TLS terminator will read it.
  if ! openssl verify -CAfile "$ca_cert" "$tmp_out" >/dev/null 2>&1; then
    rm -f "$tmp_out"
    log_error "signed leaf does not verify against $ca_cert - $out left untouched"
    return 1
  fi
  mv -f "$tmp_out" "$out" || { log_error "could not move the signed leaf into $out"; rm -f "$tmp_out"; return 1; }

  # One line per issuance on the stick itself: the recovery source if
  # server_ca.srl is ever lost, and the only record tying a deployed leaf back
  # to the run that produced it. A failure to append is loud but not fatal - the
  # leaf is already signed and verified, and discarding a good cert over an
  # audit-log write would be the worse outcome.
  printf '%s serial=%s CN=%s SAN=%s days=%s out=%s sha256=%s\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    "$(openssl x509 -in "$out" -noout -serial | sed -n 's/^serial=//p')" \
    "$cn" "$san" "$SAPOT_CA_LEAF_DAYS" "$log_name" \
    "$(openssl x509 -in "$out" -noout -fingerprint -sha256 | sed -n 's/^sha256 Fingerprint=//p')" \
    >> "$ca_log" \
    || log_warn "leaf issued, but could not append to $ca_log - record the serial by hand"
  return 0
}

# Issues (or re-issues) this server's leaf into <certs_dir>. Generates the key
# if absent, reuses it otherwise; rotate_key=true forces a fresh one.
ca_issue_leaf() {
  local certs_dir=$1 rc=0
  _ca_issue_leaf "$@" || rc=$?
  rm -f "$certs_dir/.server.key.$$" "$certs_dir/.server.csr.$$" "$certs_dir/.server.crt.$$"
  return "$rc"
}

# Implementation half of ca_issue_leaf. Split out so its temp files are cleaned
# up on every exit path without an EXIT trap, which would clobber the one
# acquire_lock installs.
_ca_issue_leaf() {
  local certs_dir=$1 ip=$2 ca_dir=$3 rotate_key=${4:-false}
  local key="$certs_dir/server.key" crt="$certs_dir/server.crt"
  local san="DNS:$SAPOT_SERVER_DNS_NAME,IP:$ip,DNS:localhost"
  local tmp_key="$certs_dir/.server.key.$$"
  local tmp_csr="$certs_dir/.server.csr.$$"
  local tmp_crt="$certs_dir/.server.crt.$$"

  # Temp files sit in $certs_dir rather than /tmp so the final mv is a
  # same-filesystem rename, i.e. atomic from a reader's point of view.

  # A server.csr on disk is an artefact of the retired workflow, where the CSR
  # waited there for a round trip to an offline signing laptop. Issuance is
  # single-shot now, so a lingering one is never meaningful.
  if [ -e "$certs_dir/server.csr" ]; then
    log_warn "removing leftover $certs_dir/server.csr from the retired CSR-transport workflow"
    rm -f "$certs_dir/server.csr"
  fi

  # Every fallible step below is checked explicitly. This function runs in a
  # context where `set -e` is suppressed (ca_issue_leaf calls it as part of a
  # || list, which disables errexit for the whole body), so an unchecked failure
  # here would fall through and sign a garbage CSR instead of aborting.
  if "$rotate_key" || [ ! -e "$key" ]; then
    "$rotate_key" && log_warn "rotating server.key - every leaf previously issued for this server stops matching once the new one is installed"
    _ca_quiet openssl req -newkey rsa:2048 -nodes -keyout "$tmp_key" -out "$tmp_csr" \
      -subj "/CN=$ip" -addext "subjectAltName=$san" \
      || { log_error "could not generate a new key and CSR"; return 1; }
  else
    log_info "reusing existing server.key"
    cp -p "$key" "$tmp_key" || { log_error "could not read $key"; return 1; }
    _ca_quiet openssl req -new -key "$tmp_key" -out "$tmp_csr" \
      -subj "/CN=$ip" -addext "subjectAltName=$san" \
      || { log_error "could not generate a CSR from $key"; return 1; }
  fi
  chmod 600 "$tmp_key" || { log_error "could not restrict permissions on the new key"; return 1; }

  log_info "requesting leaf for CN=$ip SAN=$san"
  ca_sign_csr "$ca_dir" "$tmp_csr" "$tmp_crt" "$(basename "$crt")" || return 1

  if "$rotate_key" && [ -e "$crt" ]; then
    local stale
    stale="$crt.stale-$(date -u +%Y%m%dT%H%M%SZ)"
    cp -p "$crt" "$stale"
    log_warn "kept the superseded leaf at $(basename "$stale") for audit"
  fi

  # Key first, then cert: both are already on disk and verified, and nothing
  # reads them until nginx is recreated, so the ordering only matters for a
  # doctor.sh run racing this one - which would report a key/cert mismatch
  # rather than silently pass a broken pair.
  chmod 600 "$tmp_key" && mv -f "$tmp_key" "$key" \
    || { log_error "could not install the key at $key - $crt left untouched"; return 1; }
  chmod 644 "$tmp_crt" && mv -f "$tmp_crt" "$crt" \
    || { log_error "could not install the leaf at $crt - server.key and server.crt no longer match; rerun this command"; return 1; }
  ca_install_trust_anchor "$ca_dir" "$certs_dir" \
    || { log_error "leaf installed, but the CA trust anchor could not be written - doctor.sh will report the certificate as unverifiable"; return 1; }

  log_pass "issued $crt (expires $(openssl x509 -in "$crt" -noout -enddate | sed 's/^notAfter=//'))"
}

# Copies the CA's public certificate next to the leaf. Public material only -
# it is what doctor.sh checks the leaf chains to, and what proves an install is
# CA-issued rather than self-signed.
ca_install_trust_anchor() {
  local ca_dir=$1 certs_dir=$2
  cp -f "$ca_dir/server_ca.pem" "$certs_dir/server_ca.pem" || return 1
  chmod 644 "$certs_dir/server_ca.pem"
}
