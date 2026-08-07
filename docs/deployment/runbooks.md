# Operational Runbooks

Step-by-step procedures for operating SAPOT in production. Each runbook includes a verification step — do not consider a procedure complete until verification passes.

---

## Backup and restore (MariaDB)

**When:** Before any schema change (see [ADR 0007](../adr/0007-alembic-for-server-migrations.md)), on a regular schedule if the deployment is long-running, and always before a disaster-recovery restore.

### Backup (automated)

Backups run unattended via `sapot-db-backup.timer`. Install it once per host:

```bash
sudo cp /home/sapot/YLP-software/deployment-scripts/sapot-db-backup.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now sapot-db-backup.timer
systemctl list-timers sapot-db-backup.timer
```

Default cadence is daily. For a standing or dev environment, change it to weekly with `sudo systemctl edit sapot-db-backup.timer` and add `[Timer]` plus `OnCalendar=weekly`.

Settings go in `/etc/sapot/backup.env` (mode 600, optional; all have defaults):

| Variable | Default | Meaning |
|---|---|---|
| `SAPOT_BACKUP_DIR` | `/opt/sapot/shared/db-backups` (bundle) or `/home/sapot/backups` (bare-metal) | Where dumps are written |
| `SAPOT_BACKUP_RETENTION_DAYS` | `14` | Dumps older than this are deleted |
| `SAPOT_BACKUP_MIN_KEEP` | `3` | Newest N dumps are kept regardless of age |
| `SAPOT_BACKUP_OFFHOST_DIR` | unset | Mountpoint of the removable drive to copy to |
| `SAPOT_BACKUP_MAX_AGE_HOURS` | `36` | Age at which `doctor.sh` reports the backup stale |

Dumps are named `sapot_db_<UTC timestamp>.sql.gz`. Each is verified for gzip integrity and mysqldump's completion footer before receiving its final name.

```bash
systemctl status sapot-db-backup.timer
journalctl -u sapot-db-backup.service -n 50 --no-pager
/opt/sapot/releases/current/scripts/doctor.sh
```

Set `SAPOT_BACKUP_OFFHOST_DIR` to a removable drive's mountpoint to copy each verified dump off-host. An absent drive logs a warning but does not discard the on-host dump. The script never deletes copies on removable media.

### Backup (manual, ad hoc)

```bash
/home/sapot/YLP-software/deploy/scripts/backup-db.sh
/opt/sapot/releases/current/scripts/backup-db.sh
/home/sapot/YLP-software/deploy/scripts/backup-db.sh --dry-run
```

### Restore

Restore is deliberately manual. Dumps are gzipped, and the database is `sapot_db` on bare-metal and `sapot` in a bundle.

**Bare-metal:**

```bash
sudo systemctl stop server-main-api
zcat /home/sapot/backups/sapot_db_20260807T020000Z.sql.gz | mysql -u sapot -p sapot_db
sudo systemctl start server-main-api
```

**Bundle:**

```bash
cd /opt/sapot/releases/current
docker compose -p sapot -f compose/docker-compose.yml stop api
zcat /opt/sapot/shared/db-backups/sapot_db_20260807T020000Z.sql.gz | docker compose -p sapot -f compose/docker-compose.yml exec -T db mysql -u sapot -p sapot
docker compose -p sapot -f compose/docker-compose.yml start api
```

**Verification:**

```bash
mysql -u sapot -p -e "SELECT COUNT(*) FROM sapot_db.peer;"   # bundle: FROM sapot.peer
curl -k https://localhost/auth/exists?identifier=probe@example.com
sudo journalctl -u server-main-api -n 50 --no-pager
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

2. **Move the CA onto a dedicated USB stick and secure it:**
   - Copy `server_ca.key` and `server_ca.pem` onto a USB stick reserved for this purpose, then wipe them from the machine that generated them
   - Store the stick in a physically secure location (safe, locked drawer, vault) and document who may draw it out
   - The stick is plugged into a server only while issuing a certificate, and unplugged immediately afterwards ([TLS certificate rotation](#tls-certificate-rotation-ca-pinned-server-leaf) below)
   - The stick must be mounted read-write: issuance appends to `server_ca.srl` and `issued-leaves.log` on it

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

**Trust model.** Issuance happens entirely on the server, against the CA USB stick plugged into it. One run generates the key, signs the leaf, and installs it — there is no CSR to carry and no second machine involved.

The CA private key is therefore readable on a LAN-connected host for the duration of that run. This is a deliberate trade: it removes the transport USB stick, the round trip to a signing laptop, and the digest cross-check that existed to detect tampering on that trip, in exchange for the CA key touching the server. What protects the CA is physical control of the stick, so:

- Plug the stick in only to issue, and unplug it the moment the run finishes.
- Never leave it attached across a reboot or an unattended period.
- Store it as described in [Offline CA Setup](#offline-ca-setup) between uses.
- If the server is ever suspected compromised while the stick was attached, treat the CA as compromised: issue a new CA, rebuild and redistribute the mobile app, and reissue every server leaf.

```mermaid
flowchart LR
    subgraph server["Server host (on the LAN)"]
        REQ["request-cert.sh<br/>generate server.key + CSR"]
        SIGN["sign against the CA<br/>verify the leaf chains"]
        INST["install server.crt<br/>recreate the TLS terminator"]
    end

    CA[("CA USB stick<br/>server_ca.key<br/>attached only during issuance")]

    REQ --> SIGN --> INST
    CA -. "plugged in, then removed" .-> SIGN
```

**Every leaf must carry `DNS:server.sapot.lan` as a SAN**, alongside the server's LAN IP and `localhost`. Mobile preview/production builds connect to that name and scope their CA pin to it, so a leaf missing it fails TLS hostname verification on every production handset regardless of the IP ([mobile-eas.md](mobile-eas.md#tls-ca-pinning)). `request-cert.sh` refuses to sign a CSR that lacks it, and on docker-bundle installs `doctor.sh` fails its `certificate` check if the DNS name is absent.

Both deployment paths below start by plugging the CA USB stick into the server and confirming it is mounted read-write (`lsblk -f`).

### Path A: docker-bundle deployment

Certificates live at `$SAPOT_ROOT/shared/certs/server.crt` (default `$SAPOT_ROOT` = `/opt/sapot`). See [docker-bundle.md](docker-bundle.md#tls-certificates).

1. With the CA USB stick plugged in, issue the leaf:
   ```bash
   sudo /opt/sapot/releases/current/scripts/request-cert.sh
   ```
   This is the whole procedure — it generates the key and CSR, signs against the CA on the stick, verifies the result, and installs the leaf. Specifically it:
   - Finds the stick by looking for a directory holding both `server_ca.pem` and `server_ca.key` under `/media/*/*`, `/media/*`, `/run/media/*/*`, `/mnt/*/*`, `/mnt/*`. Pass `--ca-dir <mount>` if it is mounted elsewhere, or if more than one candidate matches (the script refuses to guess).
   - Validates the stick before generating anything: that it is a real mount rather than a stale mountpoint left by an unplugged drive (override with `SAPOT_CA_ALLOW_LOCAL=1` for testing against a scratch CA only), that it is writable, and that `server_ca.pem` is an unexpired CA certificate matching `server_ca.key`. It prints the CA's subject and validity so you can confirm which CA is signing.
   - Detects the server's LAN IP automatically (prompts if detection fails) and requests SAN `DNS:server.sapot.lan,IP:<detected IP>,DNS:localhost`. The DNS name comes from `SAPOT_SERVER_DNS_NAME` in `deploy/scripts/lib/deploy-common.sh`, and signing is refused if the CSR does not carry it.
   - Reuses the existing `server.key` if there is one. Add `--rotate-key` to generate a fresh private key instead; the superseded leaf is kept alongside as `server.crt.stale-<timestamp>` for audit. `--days <n>` overrides the 825-day default.
   - Appends a record to `issued-leaves.log` on the stick, and stamps the CA's public `server_ca.pem` next to the leaf as the trust anchor `doctor.sh` checks against.

   Issuance is non-destructive: the new leaf is staged and only replaces `server.crt` once it verifies against the CA, so a failed run leaves the working cert in place and TLS keeps running. `--force`, required by the retired CSR-transport workflow, is accepted and ignored.

2. Unplug the CA USB stick.

3. Recreate `nginx` to pick up the new cert. `request-cert.sh` prints the exact command for your install state:
   - Server already has a `releases/current` install:
     ```bash
     sudo docker compose -p sapot -f /opt/sapot/releases/current/compose/docker-compose.yml up -d --force-recreate nginx
     ```
   - Fresh install (no `releases/current` yet) — note `install.sh` issues the leaf itself, so this step is only needed if you ran `request-cert.sh` first:
     ```bash
     sudo ./scripts/install.sh
     ```

### Path B: bare-metal/systemd deployment

Certificates live at `/home/sapot/certs/server.crt` ([server.md](server.md), [overview.md](overview.md)). `request-cert.sh` ships with the docker bundle and is not available here, so run the same steps with `openssl` directly.

1. With the CA USB stick mounted (`CA_USB` below), generate a key and CSR. Set `SERVER_LAN_IP` to this host's actual LAN address:
   ```bash
   CA_USB="/media/$USER/ca-usb"
   SERVER_LAN_IP="192.168.0.100"
   openssl req -newkey rsa:2048 -nodes \
     -keyout server.key.new -out server.csr \
     -subj "/CN=$SERVER_LAN_IP" \
     -addext "subjectAltName=DNS:server.sapot.lan,IP:$SERVER_LAN_IP,DNS:localhost"
   ```
   `-addext` is required: `openssl x509 -req` does not copy extensions from the CSR, so without it you get a CN-only cert that modern clients reject.

2. Sign it against the CA on the stick. The extension file carries the SAN forward and constrains the leaf:
   ```bash
   cat > leaf.ext <<'EXT'
   subjectAltName=DNS:server.sapot.lan,IP:192.168.0.100,DNS:localhost
   basicConstraints=CA:FALSE
   keyUsage=digitalSignature,keyEncipherment
   extendedKeyUsage=serverAuth
   EXT

   openssl x509 -req -in server.csr \
     -CA "$CA_USB/server_ca.pem" -CAkey "$CA_USB/server_ca.key" \
     -CAcreateserial -CAserial "$CA_USB/server_ca.srl" \
     -days 825 -extfile leaf.ext -out server.crt.new
   ```
   Edit the `subjectAltName` line to match `$SERVER_LAN_IP` — the heredoc is quoted, so it does not expand variables.

3. Verify before installing anything, and record the issuance on the stick:
   ```bash
   openssl verify -CAfile "$CA_USB/server_ca.pem" server.crt.new   # expect: OK
   printf '%s serial=%s CN=%s out=server.crt sha256=%s\n' \
     "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
     "$(openssl x509 -in server.crt.new -noout -serial | sed 's/^serial=//')" \
     "$SERVER_LAN_IP" \
     "$(openssl x509 -in server.crt.new -noout -fingerprint -sha256 | sed 's/^sha256 Fingerprint=//')" \
     >> "$CA_USB/issued-leaves.log"
   ```
   Do not proceed if `openssl verify` fails — the existing cert is still serving.

4. Unplug the CA USB stick, then install the leaf and its key:
   ```bash
   sudo install -o sapot -g sapot -m 600 server.key.new /home/sapot/certs/server.key
   sudo install -o sapot -g sapot -m 644 server.crt.new /home/sapot/certs/server.crt
   sudo install -o sapot -g sapot -m 644 "$CA_USB/server_ca.pem" /home/sapot/certs/server_ca.pem
   ```

5. Reload the TLS terminator:
   ```bash
   sudo systemctl reload nginx
   # or, if serving TLS from gunicorn directly:
   sudo systemctl restart server-main-api
   ```

**Verification.** `request-cert.sh` verifies the leaf against the CA before installing it and refuses to publish one that fails, so a normal Path A run needs no separate check. On bundle installs, `doctor.sh`'s `certificate` check independently confirms the live cert is unexpired, matches its key, chains to `server_ca.pem`, and carries both `server.sapot.lan` and the detected LAN IP as SANs. To inspect a cert by hand:
```bash
openssl x509 -in server.crt -noout -text | grep -A1 "Subject Alternative Name"
openssl verify -CAfile server_ca.pem server.crt
# expect: server.crt: OK
```

**Known gap — `server_ca.srl` lost:** signing uses `-CAcreateserial -CAserial server_ca.srl`. If `server_ca.srl` is lost, reconstruct the next serial from the highest recorded `serial=` value in `issued-leaves.log` on the CA USB stick. If that log is also gone, `-CAcreateserial` resets serial numbering from scratch, which risks a serial collision against leaves already issued and deployed in the field. This is a known manual-recovery gap, not something the tooling papers over: before resuming issuance, compare the recovered serial against any leaf certs you can still locate in the field.

**Note — this is not the dev/CI cert flow.** `docker/gen-certs.sh` is a separate dev-and-CI-only tool driven by `docker-compose.yml`'s `certgen` service, backed by the throwaway CA in `server/dev-ca/` ([server.md](server.md)). It can self-sign and is deliberately not shipped in deployment bundles. Never point it at the production CA stick, and never reuse a dev CA for a real deployment.

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
