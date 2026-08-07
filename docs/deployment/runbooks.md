# Operational Runbooks

Step-by-step procedures for operating SAPOT in production. Each runbook includes a verification step — do not consider a procedure complete until verification passes.

---

## Backup and restore (MariaDB)

**When:** Before any schema change (see [ADR 0007](../adr/0007-alembic-for-server-migrations.md)), on a regular schedule if the deployment is long-running, and always before a disaster-recovery restore.

### Backup

```bash
mysqldump --single-transaction -u sapot -p sapot_db > sapot_db_$(date +%Y%m%d_%H%M%S).sql
```

- `--single-transaction` avoids locking tables on InnoDB, so the server can keep running during backup.
- Store the dump off the server host if possible (a USB drive at the incident site, or the admin's laptop) — a backup that lives only on the machine it protects against doesn't survive hardware failure.

### Restore

```bash
sudo systemctl stop server-main-api
mysql -u sapot -p sapot_db < sapot_db_20260701_120000.sql
sudo systemctl start server-main-api
```

**Verification:**
```bash
mysql -u sapot -p -e "SELECT COUNT(*) FROM sapot_db.peer;"
curl -k https://localhost/auth/exists?identifier=probe@example.com   # expect 200 with {"exists": true/false}, not 500
sudo journalctl -u server-main-api -n 50 --no-pager   # confirm no startup errors
```

---

## Applying schema migrations (Alembic)

**When:** Deploying server code whose SQLModel classes in `server/app/models/` changed. See [migrations.md](../database/migrations.md) and [ADR 0007](../adr/0007-alembic-for-server-migrations.md).

`server/runserver.sh` already runs `alembic upgrade head` before starting gunicorn, so a normal deploy needs no separate step. Use this runbook when applying migrations out of band, or when a deploy fails at the migration step.

1. **Back up first** — run the [backup procedure](#backup-and-restore-mariadb) above. Restoring from backup is the rollback path; `alembic downgrade` is a CI verification tool, and downgrading the baseline drops every table.
2. Check what the database is currently on:
   ```bash
   cd /home/sapot/YLP-software/server
   export DATABASE_URL='mysql+pymysql://sapot:sapot@127.0.0.1:3306/sapot_db'
   alembic current
   ```
   If this prints nothing, the database predates Alembic and needs the [one-time cutover](../database/migrations.md#one-time-cutover-for-existing-databases) instead. Do not run `upgrade` on it; it will try to create tables that already exist.
3. Review what is about to be applied:
   ```bash
   alembic history --verbose
   ```
4. Apply:
   ```bash
   alembic upgrade head
   ```
5. Restart the service:
   ```bash
   sudo systemctl restart server-main-api
   ```

**Verification:**
```bash
alembic current                                           # expect the new head revision
alembic check                                             # expect "No new upgrade operations detected"
sudo journalctl -u server-main-api -n 50 --no-pager       # confirm no startup errors after restart
```

**Rollback if it goes wrong:** stop the service, restore from the pre-change backup ([restore procedure](#backup-and-restore-mariadb)), redeploy the previous server code version, restart.

---

## Offline CA Setup

**When:** One time, to establish the private certificate authority used by all subsequent server leaf issuance. This procedure is performed on an offline machine (or an air-gapped network partition) to protect the root CA private key.

### Create the Root CA (offline machine)

1. On an offline machine (not the server host), generate the private CA:
   ```bash
   openssl req -x509 -newkey rsa:4096 -nodes -days 3650 \
     -keyout server_ca.key -out server_ca.pem \
     -subj "/CN=SAPOT LAN Root CA"
   ```
   - `-nodes` means no passphrase (acceptable for an offline, air-gapped CA)
   - `-days 3650` = 10 years validity
   - This generates two files: `server_ca.key` (private, **keep offline**) and `server_ca.pem` (public, distribute to mobile app)

2. **Secure the private key:**
   - Keep `server_ca.key` on the offline machine in a physically secure location (safe, locked drawer, encrypted USB drive in a vault)
   - Never copy it to the internet-connected server host
   - Document the location and access procedure

3. **Distribute the public certificate:**
   - Copy `server_ca.pem` (public key only) to the mobile app repository as the trust anchor (Task 1.1)
   - Share `server_ca.pem` with any other clients that need to verify server certs

**Verification:**
```bash
openssl x509 -in server_ca.pem -noout -text | grep -A1 "Subject:"
# expect: Subject: CN = SAPOT LAN Root CA
openssl x509 -in server_ca.pem -noout -dates
# confirm notBefore and notAfter span 10 years
```

---

## TLS certificate rotation (CA-pinned server leaf)

**When:** Before the server leaf certificate expires, or immediately if the private key may have been exposed. This runbook re-issues a new server leaf from the offline CA (see [Offline CA Setup](#offline-ca-setup) above).

**Trust zones.** The signing step is deliberately separated from the server. The CA private key lives only on a CA USB stick, used only on an offline signing laptop. The server host never sees it — it emits a CSR and receives a signed leaf, both carried on a second, separate transport USB stick.

```mermaid
flowchart LR
    subgraph server["Server host (on the LAN)"]
        REQ["generate server.key + server.csr<br/>server.key never leaves this host"]
        INST["install signed server.crt<br/>reload/recreate the TLS terminator"]
    end

    subgraph transport["Transport USB stick"]
        T1["server.csr out"]
        T2["server.crt back"]
    end

    subgraph laptop["Offline signing laptop"]
        SIGN["sign-leaf.sh<br/>reads CA USB stick"]
        CA[("CA USB stick<br/>server_ca.key<br/>never leaves this zone")]
    end

    REQ --> T1 --> SIGN
    CA -.-> SIGN
    SIGN --> T2 --> INST
```

**Every leaf must carry `DNS:server.sapot.lan` as a SAN**, alongside the server's LAN IP and `localhost`. Mobile preview/production builds connect to that name and scope their CA pin to it, so a leaf missing it fails TLS hostname verification on every production handset regardless of the IP ([mobile-eas.md](mobile-eas.md#tls-ca-pinning)). `sign-leaf.sh` refuses SAN-less CSRs outright, and on docker-bundle installs `doctor.sh` fails its `certificate` check if the DNS name is absent.

Two deployment paths issue the CSR differently. The signing step (step 2) is identical for both.

### Path A: docker-bundle deployment

Certificates live at `$SAPOT_ROOT/shared/certs/server.crt` (default `$SAPOT_ROOT` = `/opt/sapot`). See [docker-bundle.md](docker-bundle.md#tls-certificates).

1. On the server, generate a CSR:
   ```bash
   sudo /opt/sapot/releases/current/scripts/request-cert.sh --force
   ```
   - Detects the server's LAN IP automatically (prompts interactively if detection fails) and writes `server.key`/`server.csr` into `$SAPOT_ROOT/shared/certs`, with SAN `DNS:server.sapot.lan,IP:<detected IP>,DNS:localhost`. The DNS name comes from `SAPOT_SERVER_DNS_NAME` in `deploy/scripts/lib/deploy-common.sh`.
   - `--force` is required in the common case: a `server.key` with a matching `server.crt` already on disk (either `install.sh`'s self-signed cert, or a previously-issued CA-signed leaf) and no `server.csr`. `--force` here just confirms reusing that existing key to issue a fresh CSR is intentional — it does not touch the key itself and is not a destructive rotation. Without `--force` in that state, or when `server.key` exists with no `server.crt` at all (an interrupted prior run), `request-cert.sh` refuses to proceed. Rotating the private key itself additionally requires `--force --rotate-key` (this invalidates every leaf previously issued for it, and moves any existing `server.crt` aside with a `.stale-<timestamp>` suffix for audit).
   - **If using `--rotate-key`: `server.crt` is removed from disk immediately, before the new leaf even exists.** nginx keeps serving its already-loaded cert from memory, but do not restart or recreate the nginx container, and do not reboot this host, until the signed leaf is copied back in step 3 — otherwise TLS will break with no automatic recovery.
   - Note the `server.csr sha256` digest `request-cert.sh` prints — you'll cross-check it against the digest `sign-leaf.sh` prints in step 2, to detect tampering on the transport USB stick.
   - Copy the resulting `server.csr` onto the transport USB stick.

2. On the offline signing laptop, with the CA USB stick mounted, sign the CSR:
   ```bash
   ./scripts/ca/sign-leaf.sh --ca-dir /mnt/ca-usb --csr server.csr --out server.crt --days 825
   ```
   - Prints the CA's identity and the CSR's CN/SAN plus the CSR's own `sha256` digest, then prompts for confirmation before signing (pass `--yes` to skip the prompt for scripted use); refuses to sign a CSR with no Subject Alternative Name. **Compare the printed digest against the one noted in step 1 before confirming** — a mismatch means the CSR was swapped or altered on the transport USB stick.
   - Refuses to sign if `--ca-dir` isn't on a separate mounted filesystem from `/` (a guard against a stale, unplugged mountpoint) unless `SAPOT_CA_ALLOW_LOCAL=1` is set — that env var is an escape hatch for testing against a scratch CA only, not for production signing.
   - Appends a record to `issued-leaves.log` on the CA USB stick and self-verifies the signed cert against the CA cert before reporting success; on any failure it removes the partially-written output rather than leaving an unverified cert behind.

3. Copy the signed `server.crt` back to the server on the transport USB stick, into `$SAPOT_ROOT/shared/certs`.

4. Recreate `nginx` to pick up the new cert. `request-cert.sh` printed the exact next step for your install state when it generated the CSR in step 1:
   - Server already has a `releases/current` install:
     ```bash
     sudo docker compose -p sapot -f /opt/sapot/releases/current/compose/docker-compose.yml up -d --force-recreate nginx
     ```
   - Fresh install (no `releases/current` yet):
     ```bash
     sudo ./scripts/install.sh
     ```

### Path B: bare-metal/systemd deployment

Certificates live at `/home/sapot/certs/server.crt` ([server.md](server.md), [overview.md](overview.md)). `request-cert.sh` is part of the docker bundle and is not available here, so generate the CSR with `openssl` directly. The signing step is unchanged.

1. On the server, generate a new key and CSR. Set `SERVER_LAN_IP` to this host's actual LAN address:
   ```bash
   SERVER_LAN_IP="192.168.0.100"
   openssl req -newkey rsa:2048 -nodes \
     -keyout server.key -out server.csr \
     -subj "/CN=server.sapot.lan" \
     -addext "subjectAltName=DNS:server.sapot.lan,IP:$SERVER_LAN_IP,DNS:localhost"
   ```
   - `-addext` is required. `sign-leaf.sh` refuses a CSR with no SAN, because `openssl x509 -req` does not copy extensions from the CSR and would otherwise yield a CN-only cert that modern clients reject.
   - Note the CSR digest for the step 2 cross-check: `sha256sum server.csr`.
   - Keep the existing `server.crt` in place until the new leaf arrives, so TLS keeps working if the process is interrupted.

2. Sign it on the offline laptop exactly as in Path A step 2 above, including the digest comparison.

3. Install the signed leaf and its key on the server:
   ```bash
   sudo cp server.crt server.key /home/sapot/certs/
   sudo chown sapot:sapot /home/sapot/certs/server.crt /home/sapot/certs/server.key
   sudo chmod 644 /home/sapot/certs/server.crt
   sudo chmod 600 /home/sapot/certs/server.key
   ```

4. Reload the TLS terminator:
   ```bash
   sudo systemctl reload nginx
   # or, if serving TLS from gunicorn directly:
   sudo systemctl restart server-main-api
   ```

**Verification (on the offline signing laptop, after signing):** `sign-leaf.sh` already prints the SAN read back out of the signed cert and the result of its own `openssl verify -CAfile` self-check on success — no separate manual verification is needed for a normal run. Re-run these by hand only if you need to double-check a cert after the fact:
```bash
openssl x509 -in server.crt -noout -text | grep -A1 "Subject Alternative Name"
openssl verify -CAfile server_ca.pem server.crt
# expect: server.crt: OK
```

**Known gap — `server_ca.srl` lost:** `sign-leaf.sh` uses `-CAcreateserial -CAserial server_ca.srl` internally. If `server_ca.srl` is lost, reconstruct the next serial from the highest recorded `serial=` value in `issued-leaves.log` on the CA USB stick. If that log is also gone, `-CAcreateserial` resets serial numbering from scratch, which risks a serial collision against leaves already issued and deployed in the field. This is a known manual-recovery gap, not something the tooling papers over: before resuming issuance, compare the recovered serial against any leaf certs you can still locate in the field.

**Note — leftover `server.csr` before the dev/CI CA-mount path:** `docker/gen-certs.sh` checks for a mounted `$CA_DIR` CA before it checks for a pending `server.csr`, so its CA-sign branch short-circuits ahead of the CSR-pending-error branch. Clear any leftover `server.csr` from `docker/gen-certs.sh`'s `$CERT_DIR` before exercising the `$CA_DIR`-mounted dev/CI flow, so a stale CSR left over from switching between that dev/CI flow and this production offline-CA-USB flow doesn't get silently overwritten.

**Verification (on server host, after deployment):**
```bash
# Path A: $SAPOT_ROOT/shared/certs/server.crt   Path B: /home/sapot/certs/server.crt
openssl x509 -in <cert-path> -noout -dates
# confirm notAfter reflects the new cert's expiry

echo | openssl s_client -connect <server-lan-ip>:443 2>/dev/null | openssl x509 -noout -subject -dates
# confirm the cert is being served and dates match

echo | openssl s_client -connect <server-lan-ip>:443 2>/dev/null \
  | openssl x509 -noout -text | grep -A1 "Subject Alternative Name"
# expect: DNS:server.sapot.lan, IP:<server-lan-ip>, DNS:localhost
# a missing server.sapot.lan breaks every mobile preview/production build
```

On a docker-bundle install, `sudo /opt/sapot/releases/current/scripts/doctor.sh` checks the same things (expiry, key pairing, and both SANs) in one command.

**Mobile app rebuild:** The mobile app pins the CA certificate (not the leaf) — when you re-issue a new leaf from the same CA, old app builds **continue to work without rebuilding** (the new leaf will validate against the pinned CA). Only rebuild the app if the CA itself is rotated.

---

## Rollback (server code deploy)

**When:** A server deploy introduces a regression and needs to be reverted.

1. Identify the last known-good git tag/commit (see [VERSIONING.md](../../VERSIONING.md)).
2. If the deploy included a DDL change, **do not roll back code without also reverting the schema** — check whether the new columns/tables the deploy added are still compatible with the old code (additive changes usually are; renames/type changes are not). If incompatible, restore the pre-deploy DB backup first.
3. Redeploy the previous code version:
   ```bash
   cd server
   git checkout <previous-tag>
   source app/venv/bin/activate && pip install -r app/requirements.txt
   sudo systemctl restart server-main-api
   ```
4. Confirm the regression is gone and file the incident for follow-up.

**Verification:** same health-check as the [backup/restore procedure](#backup-and-restore-mariadb), plus manual confirmation the specific regression is resolved.

---

## Disaster recovery — server hardware fails at incident site

**When:** The laptop/server hardware running the FastAPI server, MariaDB, and Redis fails or is destroyed mid-deployment.

**Immediate impact:** Mobile-to-mobile LAN messaging and calls **continue to work** — they are P2P and do not depend on the server (see [system-overview.md](../architecture/system-overview.md#system-boundaries)). What breaks immediately: new logins/registration, cross-device sync, GPS streaming to rescuers, announcements, admin operations, and SMS fallback (GSM module depends on the same DB).

```mermaid
flowchart TD
    fail["Server host fails"] --> degraded["Degraded mode:\nLAN P2P messaging/calls continue\nAuth, sync, GPS, admin, SMS unavailable"]
    degraded --> spare{"Spare host\navailable on-site?"}
    spare -- yes --> stand["Stand up full stack\n(server.md + deployment/overview.md)"]
    stand --> restore["Restore latest backup\n(#backup-and-restore-mariadb)"]
    restore --> repoint["Re-point router DNS/DHCP\nor app's server IP"]
    repoint --> resume["Devices resume sync\nautomatically once reachable"]
    spare -- no --> stay["Remain in degraded P2P-only mode\nDo NOT stand up an unconfigured server"]
```

**Recovery steps:**

1. **If a spare host is available on-site:** stand up the full stack fresh (see [server.md](server.md), [deployment/overview.md](overview.md#deployment-order)) and restore the most recent [backup](#backup-and-restore-mariadb). If backups were only stored on the failed host, this step is impossible — see the note on off-host backup storage above.
2. **If no spare host is available:** the LAN continues to function in degraded P2P-only mode. Do not attempt to route around this with a temporary unsecured server — bringing up a server without `DATABASE_URL`/`JWT_SECRET_KEY`/`CORS_ALLOWED_ORIGINS` properly configured re-opens the issues fixed in [SECURITY.md](../../SECURITY.md).
3. Once a replacement host is running, re-point the MikroTik router's DNS/DHCP (or the mobile app's configured server IP, if static) at the new host's address.
4. Mobile devices with cached credentials will resume syncing automatically once the server is reachable at the expected address; devices requiring fresh login need the new server reachable first.

> **TODO (human input required):** Confirm whether a pre-staged spare host/image is part of the standard field kit, and document the expected recovery time objective (RTO) for an incident deployment.
