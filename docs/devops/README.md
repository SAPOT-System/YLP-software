# DevOps: Landing Page

Entry point for deploying, operating, and maintaining SAPOT in a live environment.

---

## Start here

[deployment/overview.md](../deployment/overview.md) — components and deployment units, prerequisites, network requirements, and deployment order. Read this first; everything below assumes it.

## Per-component deployment guides

| Component | Guide |
|---|---|
| FastAPI server | [deployment/server.md](../deployment/server.md) — includes a Docker Compose option (`#run-with-docker`) that provisions MariaDB + Redis + TLS-terminating Nginx in one command |
| Mobile app | [deployment/mobile-eas.md](../deployment/mobile-eas.md) — EAS build/deploy |
| Admin frontend | [deployment/admin-frontend.md](../deployment/admin-frontend.md) |
| GSM module | [deployment/gsm-module.md](../deployment/gsm-module.md) |
| Tileserver | [deployment/tileserver.md](../deployment/tileserver.md) |

## Configuration and secrets

| Doc | Contents |
|---|---|
| [deployment/environment-config.md](../deployment/environment-config.md) | Every environment variable, per component |
| [deployment/secrets-management.md](../deployment/secrets-management.md) | Secret storage and rotation |
| [SECURITY.md](../../SECURITY.md) | Required secrets that fail fast at import time if unset, and why — this repo has a history of committed credentials that had to be rotated |

## Operations

| Doc | Contents |
|---|---|
| [deployment/monitoring-logging.md](../deployment/monitoring-logging.md) | Monitoring and logging setup |
| [deployment/runbooks.md](../deployment/runbooks.md) | Backup/restore, manual DB DDL application (no migration tooling — [ADR 0002](../adr/0002-no-server-migration-tooling.md)), TLS rotation, rollback, disaster recovery |
| [deployment/incident-response.md](../deployment/incident-response.md) | Severity levels, roles, and communication process during a live incident |
| [deployment/maintenance.md](../deployment/maintenance.md) | Recurring backup/cert/log/dependency upkeep schedule |

## Architecture context before making infra changes

- [architecture/component-map.md](../architecture/component-map.md) — process/service topology, ports, what talks to what
- [architecture/networking-lan-model.md](../architecture/networking-lan-model.md) — LAN topology, MikroTik router role, mDNS discovery, client isolation
- [architecture/security-architecture.md](../architecture/security-architecture.md) — auth, key hierarchy, rate limiting, transport security
- [architecture/threat-model.md](../architecture/threat-model.md) — trust boundaries, device theft / router compromise / insider threat scenarios

## Releases

[VERSIONING.md](../../VERSIONING.md) — git-tag-driven versioning, independent for mobile and server. `server/app/version.py` must match the git tag before tagging a server release.

## When something breaks

[TROUBLESHOOTING.md](../TROUBLESHOOTING.md) covers common setup/connectivity failures. For a live production incident, follow [deployment/incident-response.md](../deployment/incident-response.md) for the process (severity, comms, escalation) and [deployment/runbooks.md](../deployment/runbooks.md) for the technical fix.

## Known gap

Physical deployment steps — MikroTik router configuration for a real site, APK distribution to rescuer devices, onboarding at an incident location — are not yet documented. The guides above cover getting each service running; they don't cover field rollout.
