# Admin Management — Testing

## Strategy

| Layer       | Tooling                        | Scope                                                              |
|-------------|--------------------------------|--------------------------------------------------------------------|
| Unit        | pytest                         | JWT validation, ban-check logic, announcement expiry helper        |
| Integration | pytest + HTTPX + SQLite in-mem | All `/admin/*` endpoints, middleware logging, background loops     |
| E2E         | Playwright (admin-frontend)    | Admin login → user ban → verify banned user rejected on mobile login |

---

## Coverage Targets

| Area                              | Target |
|-----------------------------------|--------|
| Admin auth / JWT validation       | 100%   |
| User CRUD endpoints               | 100%   |
| Ban creation and enforcement      | 100%   |
| Announcement CRUD + expiry        | 90%+   |
| Activity log middleware           | 90%+   |
| Router telemetry endpoint         | 80%+   |
| Overall admin feature coverage    | ≥ 80%  |

---

## Mocking Rules

- **Database** — pytest fixtures with an in-memory SQLite database; swap MariaDB dialect.
- **MikroTik API** — mock `fetch_mikrotik_metrics`; return a fixed payload; never hit real hardware.
- **Background loops** — call `expire_announcements_loop` and `collect_metrics_loop` directly in tests rather than running the infinite loop.
- **Time** — use `freezegun` to control `datetime.utcnow()` in ban and expiry assertions.
- **Admin JWT** — generate test tokens with a known secret; use a fixture helper `admin_token()`.

---

## Test Cases

### Authentication

| Scenario | Expected result |
|----------|-----------------|
| `POST /admin/login` with valid credentials | Returns `{ access_token, token_type: "bearer", expires_in: 3600 }` |
| `POST /admin/login` with wrong password | Returns 401 |
| `POST /admin/login` with unknown username | Returns 401 |
| Request to any `/admin/*` with no token | Returns 401 |
| Request to `/admin/*` with regular user JWT | Returns 403 |
| Request to `/admin/*` with expired admin JWT | Returns 401 |

### User CRUD

| Scenario | Expected result |
|----------|-----------------|
| `GET /admin/users` | Returns paginated list with `id`, `username`, `role`, `is_active` per user |
| `GET /admin/users?page=2&limit=5` | Returns correct page slice |
| `POST /admin/users` with valid payload | User row created; response contains new user `id` |
| `POST /admin/users` with duplicate username | Returns 409 |
| `PATCH /admin/users/{id}` update `display_name` | Row updated; response reflects new value |
| `DELETE /admin/users/{id}` | `is_active` set to `false`; row not removed from DB |
| `DELETE /admin/users/{non_existent_id}` | Returns 404 |

### Role Management

| Scenario | Expected result |
|----------|-----------------|
| `PATCH /admin/users/{id}/role` with `{ role: "rescuer" }` | `users.role` updated to `rescuer` |
| `PATCH /admin/users/{id}/role` with `{ role: "user" }` | `users.role` updated to `user` |
| Admin attempts to change own role | Returns 403 |
| `PATCH /admin/users/{id}/role` with invalid role value | Returns 422 |

### Ban Management

| Scenario | Expected result |
|----------|-----------------|
| `POST /admin/users/{id}/ban` with reason and future `until` | `banneduser` row created; `until` and `reason` match payload |
| Banned user calls `POST /auth/login` before `until` | Returns 429 with `{ reason, until }` |
| Banned user calls `POST /auth/login` after `until` (past expiry) | Login succeeds normally |
| `DELETE /admin/users/{id}/ban` while ban active | Ban `until` set to `now()`; subsequent login succeeds |
| `GET /admin/users/{id}/bans` | Returns full ban history including past bans |
| `POST /admin/users/{id}/ban` when user already has active ban | Overwrites or appends depending on policy; at most one active ban enforced |

### Announcements

| Scenario | Expected result |
|----------|-----------------|
| `POST /admin/announcements` with `priority: "high"`, `audience: "all"`, no `expires_at` | Row created; `is_expired: false` |
| `POST /admin/announcements` with `expires_at` in the past | Row created; `is_expired` set to `true` by loop on next run |
| `expire_announcements_loop` runs with one expired row | That row's `is_expired` set to `true`; non-expired rows unchanged |
| `GET /announcements` as rescuer | Returns announcements with `audience: all` and `audience: rescuers`; excludes `audience: users` |
| `GET /announcements` as regular user | Returns `audience: all` and `audience: users`; excludes `audience: rescuers` |
| `GET /announcements` with expired announcement | Expired row excluded from response |
| `PATCH /admin/announcements/{id}` update `body` | Body updated; `updated_at` refreshed |
| `DELETE /admin/announcements/{id}` | Row removed; subsequent GET does not include it |

### Activity Logs

| Scenario | Expected result |
|----------|-----------------|
| Any request to `/admin/*` completes | One row added to `activity_logs` with matching `action`, `status_code`, `ip` |
| Failed request (returns 4xx) | Log row still created with the error `status_code` |
| `GET /admin/logs` | Returns paginated activity log entries |
| `GET /admin/logs?user_id=X` | Returns only entries where `user_id = X` |
| `GET /admin/logs?action=user.ban` | Returns only entries with `action = user.ban` |
| Log write failure | Request completes successfully; failure logged to stderr; no 500 returned to client |

### Router Telemetry

| Scenario | Expected result |
|----------|-----------------|
| `collect_metrics_loop` runs once | `routerhealth` and `interfacetraffic` rows inserted |
| `GET /admin/router/stats` with rows in DB | Returns most recent `cpu_percent`, `memory_*`, `uptime_seconds`, `interfaces` array |
| `GET /admin/router/stats` with no rows in DB | Returns 200 with empty/null values; no 500 |
| MikroTik API unreachable during loop run | Loop logs error; skips insert; retries on next interval |

---

## Test File Locations

```
server/
  tests/
    test_admin_auth.py
    test_admin_users.py
    test_admin_bans.py
    test_admin_announcements.py
    test_admin_logs.py
    test_admin_router_stats.py

admin-frontend/
  e2e/
    admin-ban-flow.spec.ts
```
