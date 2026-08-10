# Profile Picture API

Machine-readable spec: [`openapi/profile.yaml`](openapi/profile.yaml) (generated from the live FastAPI app).

All endpoints require a JWT Bearer token (see [authentication.md](authentication.md)) and are served under `/profile-picture`.

---

## Endpoints at a glance

| Method | Path | Auth | Summary |
|---|---|---|---|
| GET | `/profile-picture/me` | Authenticated | Return the calling user's own profile picture. |
| POST | `/profile-picture/me` | Authenticated | Upload/replace the calling user's profile picture (`multipart/form-data`, field `file`). |
| GET | `/profile-picture/{user_id}` | Authenticated | Return another user's profile picture by ID. |

---

See [profile.yaml](openapi/profile.yaml) for exact field-level request/response schemas, or the live server's `/docs` / `/openapi.json`.
