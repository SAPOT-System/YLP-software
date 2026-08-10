# Features

Ten features. `shared/` is the engine — roughly 45 % of all production code — and everything else
is a domain feature that consumes it.

| Feature | Role |
|---|---|
| `shared/` | **Engine** — P2P runtime, encryption, DI, database. See [`shared/README.md`](shared/README.md) for the sub-domain map. |
| `chat/` | Message threads, sync, conversation key management |
| `auth/` | Registration, login, guest flow, account recovery |
| `call/` | Audio/video call UI and lifecycle |
| `debug/` | Developer debug panel — dev/QA builds only, gated by `config/debug.ts` |
| `sync/` | Data sync with the server |
| `gps/` | Live location sharing (rescuers only) |
| `settings/` | User preferences |
| `announcements/` | Server-fetched announcement board |
| `getting-started/` | Onboarding screens |

Roughly in descending size: `shared/` ≫ `chat/` > `auth/` > `call/` > `debug/` ≈ `sync/` >
`gps/` > `settings/` > `announcements/` ≈ `getting-started/`.

Exact line and file counts live in one place —
[`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md#feature-structure) — along with the command to
regenerate them. They are deliberately not repeated here, because three copies of the same table
is how they went stale.

New to the codebase? Start with [`docs/ONBOARDING.md`](../docs/ONBOARDING.md).
