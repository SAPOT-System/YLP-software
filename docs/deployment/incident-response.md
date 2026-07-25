# Incident Response

Process for handling a live production problem — who does what, in what order, and how it gets closed out. For the *technical* steps once you know what's wrong (restore a backup, rotate a cert, roll back a deploy), see [runbooks.md](runbooks.md); this doc is about triage and communication around those steps.

SAPOT is typically operated by a small team (often one on-site admin) at a disaster-response deployment, not a 24/7 SRE org — this process is scaled to that reality, not a large-company incident framework.

---

## Severity levels

| Severity | Definition | Example |
|---|---|---|
| **SEV1 — Critical** | Core safety function is down: rescuers cannot communicate at all, or GPS tracking of field teams is lost | Server host down and no P2P fallback reachable; MariaDB corrupted with no recent backup |
| **SEV2 — Degraded** | Primary path is impaired but a fallback exists or the impact is partial | Auth/sync down but LAN P2P messaging still works (see [system-overview.md](../architecture/system-overview.md#system-boundaries)); SMS fallback (GSM module) down but LAN messaging is fine |
| **SEV3 — Minor** | Isolated or cosmetic issue, no immediate safety impact | Admin dashboard router-telemetry graph not updating; single device failing to sync |

Declare the higher severity when in doubt — de-escalating later is cheap, missing a SEV1 is not.

---

## Roles

At a field deployment there is usually one person wearing all of these hats. On a larger deployment, split them:

- **Incident lead** — decides severity, drives the runbook, makes the call on rollback vs. fix-forward. Only one person holds this at a time.
- **Comms** — tells rescuers/admins on the ground what's broken and what still works (e.g. "messaging is down, but LAN chat between devices in range still works"). This is the most important role for a SEV1 during an active response — people need to know what to do *right now*, not wait for a root cause.
- **Executor** — runs the actual runbook commands (restore, restart, rollback).

---

## Response steps

1. **Detect and declare.** Note the time, the symptom, and assign a severity. If you learned about it via a health-check failure or a rescuer report (see [TROUBLESHOOTING.md](../TROUBLESHOOTING.md) for common causes), start there.
2. **Communicate impact before you start fixing.** For SEV1/SEV2, tell affected users what still works — most importantly that **LAN P2P messaging and calls survive a server outage** (see [disaster-recovery flowchart](runbooks.md#disaster-recovery--server-hardware-fails-at-incident-site)). This alone prevents panic during a server-down incident.
3. **Diagnose using the narrowest tool first.** Check `sudo journalctl -u server-main-api -n 100 --no-pager` (or the relevant unit — see [monitoring-logging.md](monitoring-logging.md)) before reaching for a full restore or rollback. Most SEV2/SEV3 issues in [TROUBLESHOOTING.md](../TROUBLESHOOTING.md) are config/env-var mismatches, not data loss.
4. **Execute the matching runbook.** Don't improvise a novel fix under pressure — [runbooks.md](runbooks.md) covers backup/restore, manual DDL application, TLS rotation, rollback, and hardware-failure disaster recovery. If nothing matches, prefer the most reversible action available (restart a service before restoring a backup; restore a backup before reinstalling a host).
5. **Verify using the runbook's own verification step.** Every runbook in [runbooks.md](runbooks.md) has one — do not consider the incident resolved until it passes.
6. **Communicate resolution.** Tell the same audience from step 2 that service is restored, and what (if anything) they need to do (e.g. re-login if credentials were affected).
7. **Record what happened.** For SEV1/SEV2: date, symptom, root cause, what fixed it, and how long it took. There's no ticketing system in this repo — a dated entry in a local ops log (or, if it's a recurring class of failure, a new entry in [TROUBLESHOOTING.md](../TROUBLESHOOTING.md)) is enough. If the root cause was a schema drift or manual DDL step, also update [migrations.md](../database/migrations.md) per its own record-keeping note.

---

## Escalation

There is no on-call rotation or paging system configured for SAPOT (no PagerDuty/Opsgenie integration, no Sentry alert routing beyond the mobile app's own dashboard — see [monitoring-logging.md](monitoring-logging.md)). Escalation in practice means:

- On a field deployment: escalate to whoever holds the spare-hardware/networking role for the deployment (see the [disaster-recovery runbook](runbooks.md#disaster-recovery--server-hardware-fails-at-incident-site)).
- For a code-level regression: escalate to whoever owns the component per the table in [docs/README.md](../README.md#components).

> **TODO (human input required):** If this is deployed to a standing (non-field) environment, decide whether an alerting/paging tool should be wired up, and who the on-call escalation contact is.

---

## Post-incident

For SEV1 incidents, before closing:

- Confirm the [runbook's verification step](runbooks.md) passed and the system has been stable for a reasonable observation window, not just immediately after the fix.
- If the incident revealed a gap in a runbook (a step that didn't work, a missing prerequisite), update [runbooks.md](runbooks.md) in the same change — an incident that doesn't improve the runbook will repeat.
- If the incident was caused by a known risk already listed in [threat-model.md](../architecture/threat-model.md), no new doc is needed. If it wasn't, consider whether it should be added there.
