# Features

Quick weight reference. See `docs/ONBOARDING.md` for the full reading path.

| Feature | Lines | Files | Role |
|---|---|---|---|
| `shared/` | ~22 k | 166 | **Engine** — P2P runtime, encryption, DI, database |
| `chat/` | ~7.5 k | 45 | Message threads, sync, conversation key management |
| `auth/` | ~6.2 k | 68 | Registration, login, PIN gate, guest flow |
| `call/` | ~4.1 k | 35 | Audio/video call UI and lifecycle |
| `sync/` | ~3.2 k | 16 | Background data sync with server |
| `gps/` | ~0.7 k | 10 | Live location sharing (rescuers only) |
| `settings/` | ~0.6 k | 5 | User preferences |
| `announcements/` | ~0.4 k | 9 | Server-fetched announcement board |
| `getting-started/` | ~0.4 k | 8 | Onboarding screens |

`shared/` is ~50 % of all production code. See `shared/README.md` for the engine sub-domain map.
