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

**When:** Before the server leaf certificate at `/home/sapot/certs/server.crt` expires, or immediately if the private key may have been exposed. This runbook re-issues a new server leaf from the offline CA (see [Offline CA Setup](#offline-ca-setup) above).

### Issue a new server leaf from the CA (offline machine)

1. On the offline machine where `server_ca.key` is kept, generate a new certificate signing request (CSR):
   ```bash
   openssl req -newkey rsa:2048 -nodes -keyout server.key -out server.csr \
     -subj "/CN=server.sapot.lan"
   ```
   - This creates `server.key` (private key) and `server.csr` (the request to be signed)

2. Issue the leaf cert from the CA, adding the server's stable DNS name and IP address as Subject Alternative Names (SANs):
   ```bash
   SERVER_LAN_IP="192.168.0.100"  # or your server's actual LAN IP
   openssl x509 -req -in server.csr -CA server_ca.pem -CAkey server_ca.key \
     -CAcreateserial -days 825 \
     -extfile <(printf "subjectAltName=DNS:server.sapot.lan,IP:%s" "$SERVER_LAN_IP") \
     -out server.crt
   ```
   - `-days 825` = ~2.26 years validity (shorter than the CA, so leaves room for re-issuance before CA expiry)
   - The SAN includes both a stable DNS name (`server.sapot.lan`, for prod deployments) and the IP (for LAN-only dev/test)

3. Copy the new `server.crt` and `server.key` to the server host:
   ```bash
   scp server.crt server.key sapot@<sapot-server-host>:/tmp/
   ssh sapot@<sapot-server-host> "sudo cp /tmp/server.crt /tmp/server.key /home/sapot/certs/ && sudo chmod 600 /home/sapot/certs/server.key && sudo chown sapot:sapot /home/sapot/certs/server.*"
   ```

4. Reload the server to pick up the new cert:
   ```bash
   ssh sapot@<sapot-server-host> "sudo systemctl reload nginx"
   # or, if using gunicorn directly:
   ssh sapot@<sapot-server-host> "sudo systemctl restart server-main-api"
   ```

**Verification (on offline machine, before copying):**
```bash
# Verify the CSR
openssl req -in server.csr -noout -text | grep -A1 "Subject:"

# Verify the signed cert matches the CA
openssl verify -CAfile server_ca.pem server.crt
# expect: server.crt: OK

# Verify the SANs are correct
openssl x509 -in server.crt -noout -text | grep -A1 "Subject Alternative Name"
# expect: DNS:server.sapot.lan, IP:192.168.0.100 (or your server's IP)
```

**Verification (on server host, after deployment):**
```bash
openssl x509 -in /home/sapot/certs/server.crt -noout -dates
# confirm notAfter reflects the new cert's expiry
echo | openssl s_client -connect <sapot-server-host>:8000 2>/dev/null | openssl x509 -noout -subject -dates
# confirm the cert is being served and dates match
```

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
