# Offline Docker Deployment Bundle

This is SAPOT's production Docker path for a LAN-only site. It is separate from
the developer compose stack and from the existing bare-metal/systemd deployment
path. Build one immutable bundle on a connected machine, transport it to the
site, then install it without pulling images or downloading dependencies.

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
are safe to rerun for data integrity after interruption, including after an
already-completed Alembic migration, but they are not zero-downtime. Schedule a
maintenance window and stop site traffic while an upgrade runs.

```bash
sudo ./scripts/upgrade.sh
sudo /opt/sapot/releases/current/scripts/rollback.sh 1.4.0
```

Rollback never runs `alembic downgrade`. It requires the target to be retained
locally, permitted by `maximumRollbackVersion`, and an ancestor of the live DB
revision. By default the current release and two prior releases, along with
their image IDs and recent firmware backups, are retained. Run
`scripts/lib/retention.sh --dry-run` to preview cleanup.

`doctor.sh` checks release checksums, image IDs, services, certificate, ports,
disk, and expected hardware. Add `--json` for structured output. A site with
no GSM modem normally shows `gsm-fastapi` as `unhealthy` in raw Docker output:
that is expected because its `/health` endpoint signals no modem. `doctor.sh`
and `status.sh` interpret it as healthy-degraded when the installation records
that no hardware is attached.

## GSM firmware

The bundle contains a precompiled Arduino hex file. Use:

```bash
sudo /opt/sapot/releases/current/scripts/flash-gsm-firmware.sh --check
sudo /opt/sapot/releases/current/scripts/flash-gsm-firmware.sh --yes
```

The script holds the same deployment lock as install and upgrade, verifies the
firmware checksum and board type, stops the GSM service, reads a backup before
uploading, and restarts the service on exit. `--check` includes the backup read
but never uploads. Database backup/restore and automatic certificate renewal
are out of scope: take database backups separately and regenerate certificates
manually when their LAN IP or expiry requires it.
