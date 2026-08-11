---
slug: overview
---

# QA: Landing Page

Entry point for testing SAPOT — where test docs live, how to run each component's test suite, and where to look when a test fails or a bug needs filing.

---

## Set up an environment to test against

QA needs a running stack (server + mobile app, same as development). Follow [getting-started/quickstart.md](../getting-started/quickstart.md) for the fastest path, or [deployment/server.md#run-with-docker](../deployment/server.md#run-with-docker) for a one-command Docker Compose stack (server + MariaDB + Redis + TLS-terminating Nginx) if you'd rather not install dependencies locally.

## Automated test commands per component

| Component | Command | Notes |
|---|---|---|
| `server/app/` | `pytest` (run from `server/app/`) | |
| `mobile-app/sapot-mobile-app/` | `pnpm run testAll` | Runs test + typecheck + lint + expo-doctor together; or run `pnpm test` / `pnpm run typecheck` / `pnpm run lint` individually |
| `admin-frontend/sapot-admin/` | `pnpm run lint && pnpm run build` | No test script exists in this component — don't expect test coverage here |
| `GSM-module/` | — | No automated tests exist; verify manually per [gsm-module-setup.md](../getting-started/gsm-module-setup.md) |

## Per-feature test plans

Each feature under `docs/features/<name>/` has a `testing.md` with scenario tables (unit, integration, coverage targets, test conventions) alongside its `requirements.md` and `design.md` — read requirements → design → testing in that order to understand what's being tested and why:

| Feature | Testing doc |
|---|---|
| Account recovery | [features/account-recovery/testing.md](../features/account-recovery/testing.md) |
| Admin management | [features/admin-management/testing.md](../features/admin-management/testing.md) |
| Authentication | [features/authentication/testing.md](../features/authentication/testing.md) |
| Calls | [features/calls/testing.md](../features/calls/testing.md) |
| E2E encryption | [features/e2e-encryption/testing.md](../features/e2e-encryption/testing.md) |
| GPS | [features/gps/testing.md](../features/gps/testing.md) |
| Messaging | [features/messaging/testing.md](../features/messaging/testing.md) |
| SMS gateway | [features/sms-gateway/testing.md](../features/sms-gateway/testing.md) |
| Sync | [features/sync/testing.md](../features/sync/testing.md) |

## QA scenario/reset/login-as tooling

Dev/staging-only server endpoints (`/testing/reset`, `/testing/seed/{scenario}`, `/testing/login-as/{handle}`) plus a one-tap "log in as fixture" button in the mobile debug panel let you reset the database to a known state and switch identities without registering throwaway accounts. See [scenario-tooling.md](scenario-tooling.md) for the full endpoint list, available scenarios, safety gating, and workflow.

## Manual / E2E verification

There is no dedicated E2E test suite doc yet. For manual multi-device verification (the golden path a `testing.md` scenario table can't exercise — two physical devices over LAN), follow [getting-started/quickstart.md#4-register-a-user-and-verify-end-to-end-messaging](../getting-started/quickstart.md#4-register-a-user-and-verify-end-to-end-messaging).

## When something fails

- Setup/connectivity failure (server won't start, mobile app can't reach server, CORS, mDNS discovery, GSM auth) → [TROUBLESHOOTING.md](../TROUBLESHOOTING.md)
- Unexpected behavior that traces back to a documented decision → check [adr/](../adr/) before assuming it's a bug — e.g. LAN-first operation with no internet dependency ([ADR 0005](../adr/0005-lan-first-design.md)) is intentional
- Terminology / domain concepts (roles, LAN modes, signalling, sync) → [GLOSSARY.md](../GLOSSARY.md)

## Filing bugs

This repo does not yet have a documented bug-report template or issue-tracker convention distinct from normal feature work — file issues the same way as any other change, per the repo-root `CONTRIBUTING.md`.

## Known gap

Physical/field verification (APK install on rescuer devices, real router captive-portal flow, onboarding at an incident site) is not covered by any doc — see [docs/README.md](../README.md) for the same gap noted for deployment.
