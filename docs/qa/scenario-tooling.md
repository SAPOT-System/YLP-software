# QA scenario/reset/login-as tooling

Dev/staging-only tooling that lets a QA tester reset the database to a known state, seed a named scenario, and log in as a seeded fixture account from the mobile debug panel — instead of registering throwaway accounts by hand for every test pass.

## Server: `/testing/*` endpoints

Router: [`server/app/api/testing.py`](../../server/app/api/testing.py). Scenario builders: [`server/app/db_operations/qa_scenarios.py`](../../server/app/db_operations/qa_scenarios.py) (shared by this router and the `seed_db.py` CLI seeder).

| Endpoint | Method | Authentication | Purpose |
|---|---|---|---|
| `/testing/scenarios` | GET | QA environment | List available scenario names and descriptions |
| `/testing/seed/{scenario}` | POST | `X-QA-Token` | Build one scenario's fixture data without clearing existing data |
| `/testing/reset` | POST | `X-QA-Token` | Wipe the database and reseed the baseline scenario |
| `/testing/login-as/{handle}` | POST | `X-QA-Token` | Mint a JWT pair for a seeded fixture handle without a password |
| `/testing/test-make-admin`, `/testing/test-make-rescuer` | POST | Normal auth + `X-QA-Token` | Promote an existing user |

### Available scenarios

| Scenario | What it seeds |
|---|---|
| `baseline` | 9 sample users + admin, direct conversations, a 200+ message pagination thread, one call log per conversation |
| `roles` | `qa_baseline` / `qa_baseline_b` / `qa_rescuer` / `qa_admin` / `qa_guest` — covers every role-gated UI path |
| `empty` | `qa_empty` — zero conversations/messages/announcements, for empty-state screens |
| `large` | `qa_large` + many peers/messages/GPS points, for list perf and sync-cursor testing |
| `banned` | `qa_banned` with an active `BannedUser` row |
| `locked-out` | `qa_locked` with a `LoginAttempt` row at the lockout threshold |
| `announcements` | Active + expired announcements across all priorities and audiences |
| `gps-track` | `qa_gps` with a 60-point location history along a route |
| `calls` | `qa_calls_a` / `qa_calls_b` with completed/missed/rejected call rows |

### Safety gating (four layers)

This surface can reset a database and mint auth tokens without a password, so it's gated defense-in-depth style — see the file header in `testing.py` and `SECURITY.md`:

1. **Import gating:** `app/main.py` only imports and mounts this router when `ENVIRONMENT=development` or `staging`.
2. **`require_qa_env()`:** a router-wide dependency re-checks `IS_QA_ENABLED` at request time and returns 404 if a future change accidentally mounts the router in production.
3. **`require_qa_token()`:** every state-changing route requires an `X-QA-Token` header that matches `QA_API_TOKEN` using a constant-time comparison. The secret has no default and fails fast at import time when a QA environment enables the router.
4. **Production regression:** `test_security_regression.py` starts a production-configured subprocess and asserts that every testing path returns 404 both through the assembled app and through a deliberately mis-mounted router.

`/testing/login-as/{handle}` also uses a fixed fixture allowlist. It cannot mint a token for an arbitrary account, even when the caller has the QA token.

Set `QA_API_TOKEN` in `server/.env` (see `server/.env.example`); documented alongside other env vars in [`deployment/environment-config.md`](../deployment/environment-config.md).

## Mobile: one-tap "log in as fixture"

- UI: `features/debug/components/auth-section.tsx` in the mobile app — a row of buttons, one per fixture handle, in the Auth section of the debug panel.
- Service: `features/debug/services/debug-auth-service.ts` (`loginAs()`) — wipes local WatermelonDB data, calls `POST /testing/login-as/{handle}` with the `X-QA-Token` header, stores the returned tokens, syncs the user record, and restarts the app so all in-memory state re-initializes.
- **`qa_guest` is the exception and never calls the server.** A guest in the mobile app is a local-only identity — a `guest_user` row with a locally-generated UUID and no JWT — so there is nothing to authenticate as. The button goes straight to the guest path (`UserService.syncGuestUser`), landing on the fixed identity `QA Fixture` / `qa.fixture` so it stays reproducible, unlike the randomized "Seed LAN user" button next to it. It needs neither a seeded fixture nor a valid `X-QA-Token`.
- The debug panel itself is gated by `IS_DEBUG_ENABLED` in `config/debug.ts` (dev build, or `EXPO_PUBLIC_DEBUG_MENU=1`), opened via the draggable debug FAB (`debug-fab.tsx`).
- The mobile app's `EXPO_PUBLIC_QA_API_TOKEN` must match the server's `QA_API_TOKEN`.

## Typical QA workflow

1. Run the stack against `ENVIRONMENT=development` or `staging` with `QA_API_TOKEN` set (see [Set up an environment to test against](README.md#set-up-an-environment-to-test-against)).
2. Send `X-QA-Token` with `POST /testing/reset`, then with `POST /testing/seed/roles` or the scenario the test plan calls for.
3. In the mobile app, open the debug FAB → Auth section → tap the fixture account you need (e.g. `qa_rescuer`, `qa_admin`).
4. The app wipes local data, logs in as that fixture identity, and restarts — ready to test the role-gated flow without manual registration.

This tooling is not yet referenced from any ADR; the rationale lives in the file header of `testing.py` and the design discussion linked from GitHub issues #271–#274.
