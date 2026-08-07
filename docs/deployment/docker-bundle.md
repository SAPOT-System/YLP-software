# Offline Docker Deployment Bundle

This is SAPOT's production Docker path for a LAN-only site. It is separate from
the developer compose stack and from the existing bare-metal/systemd deployment
path. Build one immutable bundle on a connected machine, transport it to the
site, then install it without pulling images or downloading dependencies.

## Architecture

### Build → ship → run

```mermaid
flowchart LR
    subgraph dev["Dev machine"]
        RS["scripts/release.sh<br/>tags version (semver)"]
        BB["scripts/build-bundle.sh<br/>builds images, manifest.json,<br/>CHECKSUMS.sha256, firmware .hex"]
    end

    subgraph bundle["Release artifact (deploy/ bundle dir)"]
        direction TB
        M["manifest.json"]
        C["CHECKSUMS.sha256"]
        I["images/*.tar"]
        CO["compose/*.yml"]
        E["config/*.env.example"]
        CE["certs/detect-ip.sh"]
        F["firmware/gsm-arduino-*.hex"]
        D["data/static"]
        SC["scripts/ install · upgrade · rollback<br/>status · doctor · request-cert<br/>flash-gsm-firmware · lib/"]
    end

    subgraph target["Target (offline, LAN-only)"]
        INS["scripts/install.sh"]
    end

    RS -- "version tag read by" --> BB
    BB --> bundle
    bundle -- "removable media" --> INS
```

### On-target lifecycle

Every operator script (`install.sh`, `upgrade.sh`, `rollback.sh`, `status.sh`,
`doctor.sh`, `backup-db.sh`) is a thin wrapper around `scripts/lib/deploy-common.sh`,
which provides `check_schema`, `acquire_lock`, `compose`, `verify_checksums`,
`disk_preflight`, `wait_healthy`, and `write_state`.

```mermaid
flowchart TD
    Common["deploy-common.sh<br/>check_schema · acquire_lock · compose<br/>verify_checksums · disk_preflight<br/>wait_healthy · write_state"]

    Install["install.sh<br/>(first run)"] --> Common
    Upgrade["upgrade.sh<br/>(v → v+1, in place)"] --> Common
    Rollback["rollback.sh<br/>(v → v-1, DB-ancestor safe)"] --> Common
    Status["status.sh<br/>(health snapshot)"] --> Common
    Doctor["doctor.sh<br/>(pass/fail diagnostic)"] --> Common

    Common --> Lock["acquire_lock<br/>(serializes lifecycle ops)"]
    Lock --> Checksums["verify_checksums<br/>(CHECKSUMS.sha256)"]
    Common --> Disk["disk_preflight<br/>(SAPOT_ROOT + docker root,<br/>20% safety margin)"]

    Checksums --> LoadImages["docker load images/*.tar<br/>→ verify-digests.sh<br/>(manifest-pinned digests)"]
    Disk --> LoadImages

    LoadImages --> ComposeDeps["compose up -d db redis<br/>→ wait_healthy"]
    ComposeDeps --> SchemaCheck["check_schema<br/>(validates current Alembic<br/>revision before migrating)"]
    SchemaCheck --> Migrate["compose run api<br/>alembic upgrade head<br/>(ADR 0007: Alembic migrations)"]
    Migrate --> ComposeFull["compose up -d<br/>(full stack: db, redis, api,<br/>admin, gsm-fastapi, tileserver, nginx)"]
    ComposeFull --> HealthPoll["poll https://localhost/version<br/>(3min timeout)"]
    HealthPoll --> Symlink["ln -sfn releases/vX → releases/current<br/>(atomic symlink swap)"]
    Symlink --> WriteState["write_state()<br/>→ shared/state.json"]
    WriteState --> Retention["lib/retention.sh<br/>(prunes old releases/vX dirs)"]
```

### Filesystem layout on target (`$SAPOT_ROOT`, default `/opt/sapot`)

```
/opt/sapot/
├── releases/
│   ├── v1.2.0/              full copy of a bundle (cp -a from source)
│   ├── v1.3.0/
│   └── current -> v1.3.0    symlink, atomically repointed by install/upgrade/rollback
└── shared/                  persists across versions
    ├── state.json           (currentVersion, gsmHardwarePresent, history)
    ├── certs/                (TLS cert, CN = detected LAN IP)
    ├── db-data/
    ├── db-backups/           (timestamped mysqldump output, 14-day retention)
    ├── gsm-arduino-backups/  (pre-flash firmware backups)
    └── server.env, admin.env, gsm-fastapi.env, gsm-arduino.env
```

### GSM firmware flash (independent flow)

```mermaid
flowchart TD
    A["verify firmware .hex checksum against manifest"] --> B["verify board FQBN +<br/>version-compatibility constraint<br/>(semver.py satisfies)"]
    B --> C["compose stop gsm-fastapi<br/>(release the serial port)"]
    C --> D["dockerized avrdude:<br/>read-back backup of existing firmware<br/>→ shared/gsm-arduino-backups/"]
    D --> E{"--check?"}
    E -- "yes" --> F["stop here<br/>(preflight only, no upload)"]
    E -- "no" --> G["confirm prompt<br/>unless --yes"]
    G --> H["dockerized arduino-cli<br/>upload to device"]
    H --> I["restart gsm-fastapi<br/>(trap on EXIT, always runs)"]
    I --> J["record lastFirmwareFlashed<br/>in state.json"]
```

Safety mechanisms tying it together: `acquire_lock` serializes install/upgrade/
rollback/flash so only one lifecycle operation runs at a time; checksums and
manifest-pinned image digests mean the target never runs unverified images;
upgrade/rollback validate Alembic revisions ([ADR 0007](../adr/0007-alembic-for-server-migrations.md)) before migrating or reverting; and
`releases/current` is only repointed after the new stack passes a `/version`
health check, so a failed cutover leaves the previous release live.

`backup-db.sh` is driven by a host systemd timer rather than by the bundle, but
it takes the same `$SAPOT_ROOT/.lock` as install, upgrade, rollback, and firmware
flash. A backup therefore cannot run while `alembic upgrade head` is
mid-migration. On lock contention it skips that run and the next timer cycle
retries.

Enabling the timer is a manual host step, and on this path it needs two things
the bundle does not provide. The unit files are not in the tarball (the build
ships `deploy/scripts/` into the release but not `deployment-scripts/`), so
carry them on the same removable media. And the units run as `sapot`, a user
`install.sh` neither creates nor grants anything to, so the account must exist,
belong to the `docker` group, and own `shared/server.env`,
`shared/db-backups`, and `.lock`. Full procedure:
[runbooks.md](runbooks.md#backup-automated).

## Build and transport

On a clean, tagged checkout with Docker, Compose v2, `python3`, `zstd`, and
`arduino-cli` installed, run:

```bash
./scripts/build-bundle.sh --min-upgrade-version 1.4.0 --max-rollback-version 1.4.0
```

The result is `dist/sapot-bundle-vX.Y.Z.tar.zst`. Its `manifest.json` records
the version, source commit, image IDs, firmware checksum, compatibility gates,
and disk requirement. `CHECKSUMS.sha256` detects accidental corruption during
transport. It is not a tamper-evident signature.

`--min-upgrade-version` sets the manifest's `minimumUpgradeVersion` gate:
`upgrade.sh` refuses to upgrade a target whose installed release is older than
this version, so operators aren't allowed to skip straight from an
unsupported ancient release into this one. `--max-rollback-version` sets
`maximumRollbackVersion`, described below under rollback.

Copy the tarball to the offline host by removable media, extract it, and run
the bundled scripts from the extracted release. The host needs Docker Engine,
Compose v2, `python3`, `openssl`, and sufficient local disk. It never needs
internet access during installation or upgrade.

## Install and operate

```bash
tar --use-compress-program=unzstd -xf sapot-bundle-vX.Y.Z.tar.zst
cd sapot-bundle-vX.Y.Z
sudo ./scripts/install.sh
sudo /opt/sapot/releases/current/scripts/status.sh
sudo /opt/sapot/releases/current/scripts/doctor.sh
```

`install.sh` verifies checksums, creates `/opt/sapot/shared` configuration and
certificates, loads images, runs Alembic forward migrations, waits for the API,
then atomically switches `/opt/sapot/releases/current`. Per-site environment
files, database data, certificates, firmware backups, and state remain in
`shared/`; release directories are immutable.

For a later artifact, extract it and run its `scripts/upgrade.sh`. Upgrades
are idempotent: if interrupted, even after the Alembic migration has already
completed, rerunning `upgrade.sh` is safe. Upgrades are not zero-downtime,
though — schedule a maintenance window and stop site traffic while one runs.

```bash
sudo ./scripts/upgrade.sh
```

To revert to a prior release instead:

```bash
sudo /opt/sapot/releases/current/scripts/rollback.sh 1.4.0
```

Rollback never runs `alembic downgrade`. It requires the target to be retained
locally, permitted by `maximumRollbackVersion`, and an ancestor of the live DB
revision. By default the current release and two prior releases, along with
their image IDs and recent firmware backups, are retained. Run
`scripts/lib/retention.sh --dry-run` to preview cleanup.

`doctor.sh` checks release checksums, image IDs, services, certificate, ports,
disk, expected hardware, and the `db-backup` row for on-host backup age and
off-host-copy status. Add `--json` for structured output. A site with
no GSM modem normally shows `gsm-fastapi` as `unhealthy` in raw Docker output:
that is expected because its `/health` endpoint signals no modem. When the
installation's `state.json` records that no GSM hardware is attached,
`doctor.sh` and `status.sh` treat that `unhealthy` container as an expected,
non-blocking degraded state rather than a real failure.

## TLS certificates

`install.sh` issues the server's leaf from the offline CA on a USB stick you
plug into the server before installing. There is no self-signed fallback: the
mobile app pins the CA, so a cert that CA did not issue leaves every production
handset unable to connect. `install.sh` aborts before copying anything if it
cannot find and validate the CA stick.

### What every leaf must contain

Every leaf issued for a SAPOT server carries three SANs:

```
DNS:server.sapot.lan, IP:<detected LAN IP>, DNS:localhost
```

`server.sapot.lan` is load-bearing and must never be dropped. Mobile
preview/production builds connect to that name (it is the build-time
`SERVER_NAME` constant) and their network-security config scopes the CA pin to
that domain alone, so a leaf without it fails TLS hostname verification on
every production handset no matter what the LAN IP is. See
[mobile-eas.md](mobile-eas.md#tls-ca-pinning). The IP SAN serves LAN clients
that reach the server by address, and `localhost` serves the in-container
health poll. `doctor.sh`'s `certificate` check fails if the DNS name is
missing, so a bad leaf is caught before it reaches the field.

The name is defined once as `SAPOT_SERVER_DNS_NAME` in
`deploy/scripts/lib/deploy-common.sh` and consumed by `install.sh`,
`request-cert.sh`, and `doctor.sh`. Override it there (or via the environment)
if a site uses a different hostname, and rebuild the mobile app to match.

### Issuing a leaf

Plug the CA USB stick into the server, then run:

```bash
sudo /opt/sapot/releases/current/scripts/request-cert.sh
```

One run generates the key (or reuses the existing one), builds the CSR, signs
it against the CA on the stick, verifies the result, and installs the leaf.
There is no CSR to carry anywhere. Unplug the stick afterwards and recreate
`nginx` as the script instructs.

`request-cert.sh` finds the stick by looking for a directory containing both
`server_ca.pem` and `server_ca.key` under `/media/*/*`, `/media/*`,
`/run/media/*/*`, `/mnt/*/*`, and `/mnt/*`. Pass `--ca-dir <mount>` if it is
mounted elsewhere or more than one candidate matches. Add `--rotate-key` to
generate a fresh private key as well; `--days <n>` overrides the 825-day
default lifetime.

Issuance never destroys what is already serving. The new leaf is written to a
staging file and only replaces `server.crt` after it verifies against the CA,
so a failed run leaves the working cert untouched and TLS keeps running.

**Where the CA key is exposed.** The CA private key is readable on the server
for the duration of the run. That is the deliberate trade for a single-machine
workflow: it removes the transport USB stick, the CSR round trip, and the
digest cross-check that went with them, at the cost of the CA key touching a
LAN-connected host. Keep the stick physically controlled, plug it in only to
issue, and unplug it immediately after.

[runbooks.md](runbooks.md#tls-certificate-rotation-ca-pinned-server-leaf) has
the full procedure, the key-rotation warnings, and the recovery notes.

## Pitfalls

- **Bump the version for every rebuild**, even for a config/frontend-only fix.
  `upgrade.sh` targets `releases/v$version`; if that directory already exists
  it skips copying the new bundle in, so a same-version rebuild silently
  fails to deploy.
- **Never run bare `docker load` / `docker compose`** against a release.
  Always go through `install.sh` / `upgrade.sh`, which invoke compose with
  `-p sapot` via `deploy-common.sh`'s `compose()` wrapper. Omitting `-p sapot`
  creates a second, disconnected project instead of touching the live one. The
  one sanctioned exception is the `docker compose -p sapot ... up -d
  --force-recreate nginx` command `request-cert.sh` prints after a new leaf
  is dropped in — it still passes `-p sapot` and only recreates the single
  service that needs the new cert, rather than the whole stack.
- **Don't extract a bundle under `$HOME`** and run compose from there —
  `env_file` paths are relative to `$SAPOT_ROOT` and only resolve correctly
  once installed under `/opt/sapot/releases/...`.
- After any deploy, confirm `docker inspect <container> --format '{{.Image}}'`
  matches the digest in that release's `manifest.json` — a container showing
  "Up (healthy)" does not prove it's running the code you expect.

## GSM firmware

The bundle contains a precompiled Arduino hex file. Use:

```bash
sudo /opt/sapot/releases/current/scripts/flash-gsm-firmware.sh --check
sudo /opt/sapot/releases/current/scripts/flash-gsm-firmware.sh --yes
```

The script holds the same deployment lock as install and upgrade, verifies the
firmware checksum and board type, stops the GSM service, reads a backup before
uploading, and restarts the service on exit. `--check` includes the backup read
but never uploads. Database backup runs through `backup-db.sh`; certificate
renewal remains a manual operation when the LAN IP or expiry requires it.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `already installed (vX) - use upgrade.sh instead` | `install.sh` run on a host that already has `releases/current` | Run `upgrade.sh` from the new bundle instead |
| `bundle checksum verification failed` | Corrupted transfer, or the bundle was modified after build | Re-copy the tarball from source media and re-extract; do not bypass the check |
| `insufficient free space on <path>` | `requiredDiskBytes` plus the 20% margin exceeds free space on `$SAPOT_ROOT` or the Docker root | Free space or prune old releases with `scripts/lib/retention.sh` |
| `nginx/api did not become ready` | Stack came up but `/version` never answered within 3 minutes | `docker compose -p sapot logs api nginx`; the previous release is still live, so the cutover has not happened |
| Upgrade appears to succeed but nothing changed | The bundle reuses a version already in `releases/` | Rebuild with a bumped version (see Pitfalls) |
| `doctor.sh` reports `certificate SAN does not cover server.sapot.lan` | Leaf issued without the required DNS SAN | Reissue with `request-cert.sh`; mobile production builds cannot connect until fixed |
| `doctor.sh` reports `certificate does not chain to .../server_ca.pem` | The live cert was not issued by the pinned CA (e.g. carried over from a pre-CA install) | Reissue with `request-cert.sh` from the CA USB stick |
| `no CA USB stick found` | Stick not plugged in, not mounted, or mounted outside the searched paths | Plug it in, confirm with `lsblk -f`, or pass `--ca-dir <mount>` / set `SAPOT_CA_DIR` |
| `found N candidate CA directories` | More than one mounted volume carries CA material | Pass `--ca-dir <mount>` so the choice is explicit |
| `refusing to sign: <dir> is on the root filesystem` | CA USB stick not mounted, or a stale mountpoint left by an unplugged drive | Mount the stick and retry; do not set `SAPOT_CA_ALLOW_LOCAL=1` for production signing |
| `CA USB stick at <dir> is not writable` | Stick mounted read-only, so `server_ca.srl` and `issued-leaves.log` cannot be updated | Remount read-write (`mount -o remount,rw <mount>`) |
| `<path> is not a CA certificate` / `does not match` | The stick holds the wrong file as `server_ca.pem`, or mismatched CA cert and key | Check the stick against the CA identity recorded at [Offline CA Setup](runbooks.md#offline-ca-setup) |
| `gsm-fastapi` shows `unhealthy` in `docker ps` | No modem attached | Expected. `doctor.sh` and `status.sh` treat this as non-blocking when `state.json` records no GSM hardware |

## Limitations

- **Database backup and restore are out of scope.** Take backups separately, per
  [runbooks.md](runbooks.md#backup-and-restore-mariadb). Rollback protects the
  application, not the data.
- **No automatic certificate renewal.** Leaves are valid ~825 days and must be
  reissued by hand through the offline-CA workflow before expiry, or whenever
  the site's LAN IP changes.
- **Upgrades are not zero-downtime.** Schedule a maintenance window.
- **`CHECKSUMS.sha256` detects corruption, not tampering.** It is not a signature.
  Bundle integrity depends on controlling the physical transport media.
- **Rollback never reverses a migration.** A release whose schema changes are not
  an ancestor of the live DB revision cannot be rolled back to.
- **Single-host only.** The bundle assumes one Docker host per site.
