# Admin Management — Requirements

## User Stories

| ID     | As an… | I want to…                                              | So that…                                                       |
|--------|--------|---------------------------------------------------------|----------------------------------------------------------------|
| AM-01  | admin  | view a list of all registered users                     | I can monitor who is using the system                          |
| AM-02  | admin  | change a user's role (user ↔ rescuer)                  | I can manage response team composition                         |
| AM-03  | admin  | ban a user with a reason and duration                   | I can prevent disruptive behaviour during an emergency         |
| AM-04  | admin  | create announcements with a priority and target audience| I can broadcast critical information to the right people       |
| AM-05  | admin  | edit and delete existing announcements                  | I can correct mistakes or remove stale notices                 |
| AM-06  | admin  | view activity logs                                      | I can audit actions taken by users and the system              |
| AM-07  | admin  | view router telemetry (CPU, memory, interface traffic)  | I can assess network health during the operation               |
| AM-08  | admin  | log in with separate admin credentials                  | Admin access is isolated from regular user accounts            |

---

## Functional Requirements

### FR-AM-01 — Admin Authentication

- `POST /admin/login` accepts `{ username, password }` and returns a short-lived JWT with `role: admin`.
- Admin login is completely separate from the user login (`POST /auth/login`).
- Admin JWT is required for all `/admin/*` endpoints; a missing or invalid token returns 401.
- A regular user JWT used against `/admin/*` returns 403.

### FR-AM-02 — User Management

| Endpoint                  | Method | Description                          |
|---------------------------|--------|--------------------------------------|
| `/admin/users`            | GET    | Paginated list of all users          |
| `/admin/users`            | POST   | Create a new user account            |
| `/admin/users/{user_id}`  | PATCH  | Update user fields (name, role, etc) |
| `/admin/users/{user_id}`  | DELETE | Soft-delete a user account           |

Response for list includes: `id`, `username`, `display_name`, `role`, `created_at`, `is_active`.

### FR-AM-03 — Role Management

- `PATCH /admin/users/{user_id}/role` with body `{ role: "user" | "rescuer" }` updates the user's role.
- Role change takes effect on the user's next JWT refresh.
- A user cannot change their own role via this endpoint.

### FR-AM-04 — Ban Management

- `POST /admin/users/{user_id}/ban` with body `{ reason: string, until: ISO-8601 datetime }` creates a `banneduser` row.
- A banned user attempting to log in receives HTTP 429 with the reason and ban expiry.
- `DELETE /admin/users/{user_id}/ban` removes the active ban early.
- `GET /admin/users/{user_id}/bans` returns ban history for the user.

`banneduser` table:

| Column    | Type     | Notes                               |
|-----------|----------|-------------------------------------|
| id        | UUID     | Primary key                         |
| user_id   | UUID     | FK → users                          |
| until     | datetime | Ban expiry (UTC)                    |
| reason    | text     | Admin-supplied reason               |
| created_at| datetime | When the ban was created            |

### FR-AM-05 — Announcements

- Announcements are created, edited, and deleted via `/admin/announcements`.
- Each announcement has:

  | Field      | Type                             | Notes                              |
  |------------|----------------------------------|------------------------------------|
  | id         | UUID                             |                                    |
  | title      | string                           |                                    |
  | body       | text                             |                                    |
  | priority   | enum `low` \| `medium` \| `high` | Controls display prominence        |
  | audience   | enum `all` \| `rescuers` \| `users` | Controls who sees the announcement |
  | expires_at | datetime (nullable)              | Null = never expires               |
  | is_expired | boolean                          | Set by background `expire_announcements_loop` |
  | created_at | datetime                         |                                    |

- A background thread (`expire_announcements_loop`) runs every minute and sets `is_expired = true` for rows where `expires_at <= now()`.
- Expired announcements are excluded from user-facing endpoints but remain in the admin list.

### FR-AM-06 — Activity Logs

- Every request to `/admin/*` and configurable user endpoints generates an entry in the `activity_logs` table.
- Log entry fields:

  | Column        | Type   | Notes                                      |
  |---------------|--------|--------------------------------------------|
  | id            | UUID   |                                            |
  | user_id       | UUID   | Who performed the action (nullable for system) |
  | action        | string | e.g. `user.ban`, `announcement.create`     |
  | metadata_json | JSON   | `{ status_code, duration_ms, ip }`         |
  | created_at    | datetime |                                          |

- `GET /admin/logs` returns paginated activity logs filterable by `user_id`, `action`, and date range.

### FR-AM-07 — Router Telemetry

- `GET /admin/router/stats` returns the most recent snapshot from the `routerhealth` and `interfacetraffic` tables.
- A background thread (`collect_metrics_loop`) polls the MikroTik router API at a configurable interval and inserts new rows.
- The response includes CPU percentage, memory usage, uptime, and per-interface RX/TX byte counters.

---

## Non-Functional Requirements

| ID       | Requirement                                                              |
|----------|--------------------------------------------------------------------------|
| NFR-AM-01 | All `/admin/*` endpoints require TLS in production                     |
| NFR-AM-02 | Admin JWT expiry: 1 hour (shorter than user JWT)                       |
| NFR-AM-03 | Activity log writes must not block the request; use background task     |
| NFR-AM-04 | Admin frontend is a separate Next.js application (`admin-frontend/`)   |

---

## Out of Scope

- Multi-admin role tiers (all admins have equivalent privileges in v1).
- Real-time admin dashboard push (admin frontend polls; no WebSocket for admin).
- Admin-side end-to-end encrypted message reading (E2E encryption protects message contents from all parties including admins).
