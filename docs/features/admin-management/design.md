# Admin Management — Design

## Overview

The admin layer is a FastAPI router (`admin.py`) mounted at `/admin`. It is consumed exclusively by a separate Next.js admin frontend (`admin-frontend/`). Regular mobile app users never interact with these endpoints. All routes require an admin-scoped JWT.

This feature is server-mediated; it has no P2P path.

---

## Architecture

```
admin-frontend/ (Next.js)
  └── HTTP REST ──────────────────────────────────────────────────────────────►
                                                           server/app/api/admin.py
                                                           FastAPI router /admin
                                                             ├── auth     (login)
                                                             ├── users    (CRUD + role + ban)
                                                             ├── announce (CRUD)
                                                             ├── logs     (read)
                                                             └── router   (telemetry)
                                                                  │
                                                             Background threads
                                                             ├── expire_announcements_loop
                                                             └── collect_metrics_loop
```

---

## Router — `server/app/api/admin.py`

All routes use the `APIRouter(prefix="/admin", tags=["admin"])` pattern. Every dependency injection chain includes `require_admin_token(token: str = Depends(oauth2_scheme))` which validates the JWT claim `role == "admin"`.

### Admin Authentication

```
POST /admin/login
Body: { username: str, password: str }
Returns: { access_token: str, token_type: "bearer", expires_in: 3600 }
```

- Credentials checked against a separate `admin_users` table (bcrypt hashed passwords).
- JWT payload: `{ sub: admin_id, role: "admin", exp: now + 3600 }`.
- Issued token is separate from user JWT; user tokens are rejected by `require_admin_token`.

### User CRUD

| Method | Path                        | Handler                   |
|--------|-----------------------------|---------------------------|
| GET    | /admin/users                | list_users (paginated)    |
| POST   | /admin/users                | create_user               |
| PATCH  | /admin/users/{user_id}      | update_user               |
| DELETE | /admin/users/{user_id}      | soft_delete_user          |

`soft_delete_user` sets `users.is_active = false`; the record is not removed from the database.

### Role Management

```
PATCH /admin/users/{user_id}/role
Body: { role: "user" | "rescuer" }
```

Updates `users.role`. Does not allow admin to change their own role (validated against `current_admin.id == user_id`).

### Ban Management

```
POST   /admin/users/{user_id}/ban     → create banneduser row
DELETE /admin/users/{user_id}/ban     → set banneduser.until = now() (early lift)
GET    /admin/users/{user_id}/bans    → list ban history
```

Ban check on user login (in `auth.py`):

```python
active_ban = db.query(BannedUser).filter(
    BannedUser.user_id == user.id,
    BannedUser.until > datetime.utcnow()
).first()
if active_ban:
    raise HTTPException(429, detail={"reason": active_ban.reason, "until": active_ban.until})
```

### Announcements

```
GET    /admin/announcements           → list all (including expired)
POST   /admin/announcements           → create
PATCH  /admin/announcements/{id}      → update title/body/priority/audience/expires_at
DELETE /admin/announcements/{id}      → hard delete
GET    /announcements                 → public endpoint; returns non-expired rows scoped to audience
```

The public `GET /announcements` endpoint (no `/admin` prefix) checks `current_user.role` against the announcement's `audience` field:

| Audience   | Visible to               |
|------------|--------------------------|
| `all`      | all authenticated users  |
| `rescuers` | users with rescuer role  |
| `users`    | users without rescuer role |

#### `expire_announcements_loop`

```python
async def expire_announcements_loop():
    while True:
        await asyncio.sleep(60)
        db.execute(
            update(Announcement)
            .where(Announcement.expires_at <= datetime.utcnow())
            .values(is_expired=True)
        )
        db.commit()
```

Started as a background task in the FastAPI `lifespan` context.

### Activity Logs

A FastAPI middleware records every request to `/admin/*`:

```python
@app.middleware("http")
async def activity_log_middleware(request: Request, call_next):
    start = time.monotonic()
    response = await call_next(request)
    duration_ms = int((time.monotonic() - start) * 1000)
    if request.url.path.startswith("/admin"):
        background_tasks.add_task(
            write_activity_log,
            user_id=extract_user_id(request),
            action=derive_action(request.method, request.url.path),
            metadata={"status_code": response.status_code, "duration_ms": duration_ms, "ip": request.client.host}
        )
    return response
```

`write_activity_log` runs in a background task so it does not add latency to the response.

### Router Telemetry

```
GET /admin/router/stats
Returns: { cpu_percent, memory_used_mb, memory_total_mb, uptime_seconds, interfaces: [{ name, rx_bytes, tx_bytes }] }
```

Data sourced from the most recent rows in `routerhealth` and `interfacetraffic`.

#### `collect_metrics_loop`

```python
async def collect_metrics_loop():
    while True:
        await asyncio.sleep(METRICS_INTERVAL_SECONDS)  # default 30
        metrics = await fetch_mikrotik_metrics()
        db.add(RouterHealth(**metrics.health))
        for iface in metrics.interfaces:
            db.add(InterfaceTraffic(**iface))
        db.commit()
```

Started alongside `expire_announcements_loop` in the FastAPI `lifespan` context.

---

## Data Models

### `banneduser`

```sql
CREATE TABLE bannedusers (
  id         CHAR(36)   PRIMARY KEY,
  user_id    CHAR(36)   NOT NULL REFERENCES users(id),
  until      DATETIME   NOT NULL,
  reason     TEXT       NOT NULL,
  created_at DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### `activity_logs`

```sql
CREATE TABLE activity_logs (
  id            CHAR(36)   PRIMARY KEY,
  user_id       CHAR(36)   REFERENCES users(id),
  action        VARCHAR(128) NOT NULL,
  metadata_json JSON,
  created_at    DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### `routerhealth`

```sql
CREATE TABLE routerhealth (
  id              CHAR(36)  PRIMARY KEY,
  cpu_percent     FLOAT,
  memory_used_mb  INT,
  memory_total_mb INT,
  uptime_seconds  BIGINT,
  collected_at    DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### `interfacetraffic`

```sql
CREATE TABLE interfacetraffic (
  id           CHAR(36)     PRIMARY KEY,
  interface    VARCHAR(64),
  rx_bytes     BIGINT,
  tx_bytes     BIGINT,
  collected_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

## Admin Frontend — `admin-frontend/`

- Next.js application served separately from the main server.
- Uses the admin JWT stored in `httpOnly` cookies for all `/admin/*` requests.
- Key pages: Users list, User detail (with ban history), Announcements, Activity Logs, Router Stats.
- No WebSocket connections; all data fetched via REST polling.

---

## Non-goals

- No fine-grained admin permission tiers — any holder of an admin JWT has full access to every `/admin/*` route; there is no "read-only admin" or per-resource permission scoping (consistent with the flat [roles model](../../adr/0006-four-tier-roles-model.md)).
- No audit-log tamper protection — `activity_logs` rows can be deleted/modified by anyone with direct DB access; this is an operational log, not a cryptographically-verifiable audit trail.
- No self-service admin account creation — admin accounts are provisioned out-of-band (not documented as part of this feature).

## Failure handling

- **Router unreachable during `collect_metrics_loop`:** a failed `fetch_mikrotik_metrics()` call is expected to be caught and logged per iteration; the loop must continue on the next `METRICS_INTERVAL_SECONDS` tick rather than crash the background task permanently.
- **Activity log write failure:** `write_activity_log` runs as a background task specifically so a logging failure never blocks or fails the underlying admin request — the request's response is already sent before the log write is attempted.
- **Ban applied to a currently-logged-in user:** the ban is enforced at the *next* login attempt (`auth.py`'s ban check), not by revoking existing tokens — an already-issued JWT for a banned user remains valid until it naturally expires or is separately blacklisted.
- **Self-role-change attempt:** rejected with a validation error (`current_admin.id == user_id` check) rather than silently no-op'd, so the frontend can surface a clear error.

## Performance impact

- `list_users` is paginated (`fastapi-pagination`) to avoid returning the full user table in one response as the user base grows.
- `collect_metrics_loop` and `expire_announcements_loop` are lightweight, interval-driven background tasks (30s / 60s ticks) — negligible steady-state CPU cost, but both share the same event loop as request handling, so a slow router response inside `fetch_mikrotik_metrics()` could delay other async work during that tick.
- The activity-log middleware adds one background DB write per `/admin/*` request; this is async and does not block the response, but does add DB write load proportional to admin traffic volume.

## Scalability

- Designed for a single admin frontend instance talking to a single server instance — no multi-instance coordination for the background loops (`collect_metrics_loop`/`expire_announcements_loop`) is implemented, so running multiple server instances against the same DB would duplicate metric collection and announcement-expiry writes.
- `activity_logs` and `interfacetraffic`/`routerhealth` grow unboundedly over the deployment's lifetime; no retention/pruning policy exists today.

## Acceptance criteria

- An admin can list, create, update, and soft-delete users, and change a user's role (except their own).
- A banned user cannot log in while the ban is active; the ban can be lifted early.
- Announcements are only visible to their configured audience and disappear once expired.
- Every `/admin/*` request produces an activity log entry without adding request latency.
- Router telemetry displayed in the dashboard reflects data collected within the last `METRICS_INTERVAL_SECONDS` (30s) under normal operation.
