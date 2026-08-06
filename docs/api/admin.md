# Admin API

Machine-readable spec: [`openapi/admin.yaml`](openapi/admin.yaml) (generated from the live FastAPI app).

All admin endpoints are under `/api/admin` (router in `server/app/api/admin.py`) and require the `admin` role via `get_current_user_admin` unless noted. Router/network telemetry under `/api/admin/router/*` is a separate router (`server/app/api/mikrotik.py`) — see [mikrotik-telemetry.md](mikrotik-telemetry.md).

---

## Endpoints at a glance

| Method | Path | Auth | Summary |
|---|---|---|---|
| GET | `/api/admin` | Admin | Health check — confirms the caller holds the admin role. |
| POST | `/api/admin/login` | None | Admin-specific login (OAuth2 form: `username`/`password`); validates the user holds the `admin` role. |
| POST | `/api/admin/refresh` | None | Exchange a refresh token for a new token pair (admin context). |
| POST | `/api/admin/logout` | Admin | Blacklist the current admin access token. |
| GET | `/api/admin/me` | Admin | Return the calling admin's own admin-facing info. |
| GET | `/api/admin/get-active-users` | Admin | Return the latest known location for every currently-online user (GPS admin view). |
| GET | `/api/admin/network/usage` | Admin | Live network throughput + interface details for the server host. |
| GET | `/api/admin/network/interfaces` | Admin | List available network interfaces on the server host. |
| GET | `/api/admin/users-activity` | Admin | Paginated list of users with recent activity summary. |
| POST | `/api/admin/create/user/rescuer` | Admin | Grant the rescuer role to an existing user. |
| POST | `/api/admin/create/user/api/admin` | Admin | Grant the admin role to an existing user. |
| POST | `/api/admin/remove/user/api/admin` | Admin | Revoke the admin role from a user. |
| POST | `/api/admin/remove/user/rescuer` | Admin | Revoke the rescuer role from a user. |
| POST | `/api/admin/create/user` | Admin | Create a new user account through the admin interface. |
| POST | `/api/admin/edit/user` | Admin | Update a user's profile fields. |
| POST | `/api/admin/delete/user` | Admin | Delete a user account. |
| POST | `/api/admin/ban/user` | Admin | Ban a user for `duration_in_days` (query params: `user_id`, `duration_in_days`). |
| POST | `/api/admin/unban/user` | Admin | Lift an active ban for a user (query param: `user_id`). |
| GET | `/api/admin/get-logs` | Admin | Retrieve system/activity logs (paginated). |
| GET | `/api/admin/user-info` | Admin | Look up a single user's admin-facing profile info. |
| POST | `/api/admin/post-announcement` | Admin | Create an announcement. |
| GET | `/api/admin/get-all-announcements` | Admin | List all announcements (paginated). |
| PATCH | `/api/admin/announcements/{announcement_id}` | Admin | Edit an existing announcement. |
| DELETE | `/api/admin/announcements/{announcement_id}` | Admin | Delete an announcement. |

---

## Ban Management

`POST /api/admin/ban/user` bans a user for a fixed number of days from now. If the user already has an active ban row, its `until` is extended; otherwise a new `BannedUser` row is created. `POST /api/admin/unban/user` clears any active ban immediately.

---

## Announcements

`POST /api/admin/post-announcement` request body maps to the `Announcement` / `PriorityType` / `AudienceType` models in `server/app/models/announcement.py` — see [`openapi/admin.yaml`](openapi/admin.yaml) for the generated field schema. `PATCH /api/admin/announcements/{announcement_id}` edits an existing announcement; `DELETE /api/admin/announcements/{announcement_id}` removes it.

---

## Network / Router Stats

`GET /api/admin/network/usage` and `GET /api/admin/network/interfaces` report live host-level network stats (from `psutil`/`socket`). Mikrotik router-specific telemetry (`/api/admin/router/*`) is documented separately in [mikrotik-telemetry.md](mikrotik-telemetry.md).

---

See [admin.yaml](openapi/admin.yaml) for exact field-level request/response schemas, or the live server's `/docs` / `/openapi.json`.
