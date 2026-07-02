# Admin API

Machine-readable spec: [`openapi/admin.yaml`](openapi/admin.yaml) (generated from the live FastAPI app).

All admin endpoints are under `/admin` (router in `server/app/api/admin.py`) and require the `admin` role via `get_current_user_admin` unless noted. Router/network telemetry under `/admin/router/*` is a separate router (`server/app/api/mikrotik.py`) — see [mikrotik-telemetry.md](mikrotik-telemetry.md).

---

## Endpoints at a glance

| Method | Path | Auth | Summary |
|---|---|---|---|
| GET | `/admin` | Admin | Health check — confirms the caller holds the admin role. |
| POST | `/admin/login` | None | Admin-specific login (OAuth2 form: `username`/`password`); validates the user holds the `admin` role. |
| POST | `/admin/refresh` | None | Exchange a refresh token for a new token pair (admin context). |
| POST | `/admin/logout` | Admin | Blacklist the current admin access token. |
| GET | `/admin/get-active-users` | Admin | Return the latest known location for every currently-online user (GPS admin view). |
| GET | `/admin/network/usage` | Admin | Live network throughput + interface details for the server host. |
| GET | `/admin/network/interfaces` | Admin | List available network interfaces on the server host. |
| GET | `/admin/users-activity` | Admin | Paginated list of users with recent activity summary. |
| POST | `/admin/create/user/rescuer` | Admin | Grant the rescuer role to an existing user. |
| POST | `/admin/create/user/admin` | Admin | Grant the admin role to an existing user. |
| POST | `/admin/remove/user/admin` | Admin | Revoke the admin role from a user. |
| POST | `/admin/remove/user/rescuer` | Admin | Revoke the rescuer role from a user. |
| POST | `/admin/create/user` | Admin | Create a new user account through the admin interface. |
| POST | `/admin/edit/user` | Admin | Update a user's profile fields. |
| POST | `/admin/delete/user` | Admin | Delete a user account. |
| POST | `/admin/ban/user` | Admin | Ban a user for `duration_in_days` (query params: `user_id`, `duration_in_days`). |
| POST | `/admin/unban/user` | Admin | Lift an active ban for a user (query param: `user_id`). |
| GET | `/admin/get-logs` | Admin | Retrieve system/activity logs (paginated). |
| GET | `/admin/user-info` | Admin | Look up a single user's admin-facing profile info. |
| POST | `/admin/post-announcement` | Admin | Create an announcement. |
| GET | `/admin/get-all-announcements` | Admin | List all announcements (paginated). |
| PATCH | `/admin/announcements/{announcement_id}` | Admin | Edit an existing announcement. |
| DELETE | `/admin/announcements/{announcement_id}` | Admin | Delete an announcement. |

---

## Ban Management

`POST /admin/ban/user` bans a user for a fixed number of days from now. If the user already has an active ban row, its `until` is extended; otherwise a new `BannedUser` row is created. `POST /admin/unban/user` clears any active ban immediately.

---

## Announcements

`POST /admin/post-announcement` request body maps to the `Announcement` / `PriorityType` / `AudienceType` models in `server/app/models/announcement.py` — see [`openapi/admin.yaml`](openapi/admin.yaml) for the generated field schema. `PATCH /admin/announcements/{announcement_id}` edits an existing announcement; `DELETE /admin/announcements/{announcement_id}` removes it.

---

## Network / Router Stats

`GET /admin/network/usage` and `GET /admin/network/interfaces` report live host-level network stats (from `psutil`/`socket`). Mikrotik router-specific telemetry (`/admin/router/*`) is documented separately in [mikrotik-telemetry.md](mikrotik-telemetry.md).

---

See [admin.yaml](openapi/admin.yaml) for exact field-level request/response schemas, or the live server's `/docs` / `/openapi.json`.
