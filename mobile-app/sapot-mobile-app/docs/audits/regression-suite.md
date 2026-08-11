# Regression Suite — SAPOT Mobile App

Revised: 2026-06-20

This document defines the must-pass regression tests for every release. These tests cover the highest-risk paths: critical user journeys, security boundaries, data integrity, and transport-mode behavior.

**Execution types:**
- **AUTOMATED** — runs in CI (Jest / RNTL / Pytest); safe to gate merges
- **HYBRID** — scripted Maestro flow; requires emulator or device in CI with device farm
- **MANUAL** — physical device only; see `manual-testing-addendum.md`; blocks release, not PRs

---

## Release Gate Criteria

Before merging to `main` or tagging a release:
- [ ] All REG-P0 tests pass
- [ ] `pnpm test` passes for affected features
- [ ] `pnpm run typecheck` passes
- [ ] `pnpm run lint` is clean
- [ ] No new CRITICAL or HIGH security findings

---

## REG-P0 — Must Pass Every Release

### Authentication & Sessions

| ID | Name | What It Verifies | Test Type | Target File |
|----|------|-----------------|-----------|-------------|
| REG-001 | Server login happy path | `POST /auth/token` returns valid tokens; `MainContainer` initializes; Chats tab loads | Maestro E2E | `flows/auth/server-login.yaml` |
| REG-002 | Guest login happy path | Guest name entry; Chats tab loads in LAN mode; no server call made | Maestro E2E | `flows/auth/guest-login.yaml` |
| REG-003 | Access token refresh | Expired access token auto-renewed by interceptor; request succeeds transparently | Jest unit | `features/shared/core/api/__tests__/client-interceptor.test.ts` |
| REG-004 | Logout clears session | `POST /auth/logout` called; tokens removed; redirected to login | Maestro E2E | `flows/auth/logout.yaml` |
| REG-005 | Expired session redirects to login | Session > 60 days; app reopened | Jest unit | `features/auth/context/__tests__/auth-context.test.tsx` |
| REG-006 | Banned account blocked | Login with banned account shows BannedBanner | RNTL | `features/auth/context/__tests__/auth-context.test.tsx` |
| REG-007 | Locked account blocked | Login on locked account shows LockoutBanner; form disabled | RNTL | `features/auth/context/__tests__/auth-context.test.tsx` |

### Transport Mode Guards

| ID | Name | What It Verifies | Test Type | Target File |
|----|------|-----------------|-----------|-------------|
| REG-010 | Guest locked to LAN | `AppModeStore.getEffectiveMode(isGuest=true)` always returns "lan" | Jest unit | `features/shared/stores/__tests__/app-mode-store.test.ts` |
| REG-011 | LAN mode blocks WS chat fallback | `ConnectionService.sendChatMessage()` throws when no data channel in LAN mode | Jest unit | `features/shared/connection/services/__tests__/connection-service.test.ts` |
| REG-012 | Guest Public Chat tab hidden | Tab `href` is null for guest | RNTL | `app/(drawer)/(tabs)/__tests__/tab-layout.test.tsx` |
| REG-013 | Guest Map tab hidden | Tab `href` is null for non-rescuers | RNTL | `app/(drawer)/(tabs)/__tests__/tab-layout.test.tsx` |
| REG-014 | Rescuer Map tab visible | Tab renders for rescuer users | RNTL | `app/(drawer)/(tabs)/__tests__/tab-layout.test.tsx` |

### Messaging

| ID | Name | What It Verifies | Test Type | Target File |
|----|------|-----------------|-----------|-------------|
| REG-020 | Message SENDING → SENT → DELIVERED | ACK received within 12 s; status transitions | Jest unit | `features/chat/services/__tests__/chat-service.test.ts` |
| REG-021 | ACK timeout marks NOT_SENT | No ACK after 12 s → NOT_SENT | Jest unit | `features/chat/services/__tests__/chat-service.test.ts` |
| REG-022 | Messages encrypted before DB write | `MessageRepository.save()` stores ciphertext | Jest unit | `features/chat/repositories/__tests__/message-repository.test.ts` |
| REG-023 | Messages decrypted on read | `MessageRepository.query()` returns plaintext | Jest unit | `features/chat/repositories/__tests__/message-repository.test.ts` |
| REG-024 | Message deduplication by messageId | Duplicate insert rejected silently | Jest unit | `features/chat/repositories/__tests__/message-repository.test.ts` |
| REG-025 | ConversationKeyStore max 5 keys | 6th key evicts oldest | Jest unit | `features/chat/repositories/__tests__/conversation-key-store.test.ts` |
| REG-026 | Historical key decrypts old messages | 5th key decrypts message encrypted before rotation | Jest unit | `features/chat/repositories/__tests__/conversation-key-store.test.ts` |

### Call Lifecycle

| ID | Name | What It Verifies | Test Type | Target File |
|----|------|-----------------|-----------|-------------|
| REG-030 | Accept incoming call → Call Room | Accept → permissions → navigates to Call Room | Maestro E2E | `flows/call/accept-call.yaml` |
| REG-031 | Reject incoming call → Chats | Reject → `rejectIncomingCall()` → Chats tab | Maestro E2E | `flows/call/reject-call.yaml` |
| REG-032 | Auto-dismiss after 30 s (missed) | No action for 30 s → missed call saved | Jest unit | `features/call/services/__tests__/call-service.test.ts` |
| REG-033 | Simultaneous call tie-breaker | Deterministic resolution; no deadlock | Jest unit | `features/shared/connection/services/__tests__/connection-service.test.ts` |
| REG-034 | Call log saved on end | `MessageType.CALL_LOG` in DB with duration | Jest unit | `features/call/services/__tests__/call-service.test.ts` |
| REG-035 | End call from Call Room | Both disconnected; navigate back | Maestro E2E | `flows/call/end-call.yaml` |

### Discovery & Connection

| ID | Name | What It Verifies | Test Type | Target File |
|----|------|-----------------|-----------|-------------|
| REG-040 | mDNS peer discovery registers peer | ZeroconfAdapter → `peerService.register()` | Jest unit | `features/shared/connection/services/__tests__/discovery-service.test.ts` |
| REG-041 | Peer rediscovery triggers reconnect | Address change → `resendToPeer()` | Jest unit | `features/shared/connection/services/__tests__/discovery-service.test.ts` |
| REG-042 | TCP handshake + ECDH encryption | TcpClientAdapter completes NaCl-encrypted handshake | Jest unit | `features/shared/connection/adapters/__tests__/tcp-client-adapter.test.ts` |
| REG-043 | Max 5 retry attempts | Auto-reconnect stops after 5 failures | Jest unit | `features/chat/hooks/__tests__/use-chat-connection.test.ts` |
| REG-044 | Exponential backoff timing | Delays: 1s, 1.8s, 3.2s, 5.8s, 10.4s (±20% jitter) | Jest unit | `features/chat/hooks/__tests__/use-chat-connection.test.ts` |

### Background Connectivity & Notifications

| ID | Name | What It Verifies | Test Type | Target File |
|----|------|-----------------|-----------|-------------|
| REG-050 | Foreground service starts on background | Background app state starts `react-native-background-actions` | Jest unit | `features/shared/hooks/__tests__/use-foreground-service.test.ts` |
| REG-051 | Foreground service stops on active | Active app state stops `react-native-background-actions` | Jest unit | `features/shared/hooks/__tests__/use-foreground-service.test.ts` |
| REG-052 | Background call notification fires while process is alive | `audio-call` produces an `incoming-call` notification with ringtone | Maestro E2E | `flows/notifications/background-call.yaml` |
| REG-053 | Cold-start from notification | `getLastNotificationResponseAsync()` → Incoming Call screen | Maestro E2E | `flows/notifications/cold-start-call.yaml` |
| REG-054 | Notification deduplication | Two identical notifications → one navigation in 30 s | Jest unit | `features/shared/connection/services/__tests__/notification-service.test.ts` |

### Sync

| ID | Name | What It Verifies | Test Type | Target File |
|----|------|-----------------|-----------|-------------|
| REG-060 | Pull sync scoped to own data | User A cannot see user B's private conversations | Pytest | `tests/test_sync.py` |
| REG-061 | Push conflict detection | Stale `updated_at` → 409 | Pytest | `tests/test_sync.py` |
| REG-062 | Sync retry backoff (max 5, max 30 s) | Retries with exponential delays; stops after 5 | Jest unit | `features/sync/services/__tests__/sync-service.test.ts` |

### Security Boundaries

| ID | Name | What It Verifies | Test Type | Target File |
|----|------|-----------------|-----------|-------------|
| REG-070 | Testing endpoints blocked in prod | `POST /testing/*` → 404 or 401 | Pytest | `tests/test_security.py` |
| REG-071 | GPS monitor WS requires auth | No-token connect → 1008 close | Pytest | `tests/test_security.py` |
| REG-072 | `/auth/exists` rate-limited | >N req/min → 429 | Pytest | `tests/test_security.py` |
| REG-073 | Captive portal disconnect bug fixed | PATCH `…/disconnect` → 200 (not 500 NameError) | Pytest | `tests/test_captive_portal.py` |
| REG-074 | JWT uses env secret | `JWT_SECRET_KEY` set; no hardcoded fallback used | Manual / CI | CI env check |
| REG-075 | Messages encrypted at rest | DB `content` is ciphertext | Jest unit | `features/chat/repositories/__tests__/message-repository.test.ts` |
| REG-076 | TCP traffic encrypted | TcpClientAdapter sends NaCl box bytes | Jest unit | `features/shared/connection/adapters/__tests__/tcp-client-adapter.test.ts` |
| REG-077 | WS relay payloads E2E encrypted | WS message body is opaque blob | Jest unit | `features/shared/services/__tests__/ws-encryption.test.ts` |

### Guest Migration

| ID | Name | What It Verifies | Test Type | Target File |
|----|------|-----------------|-----------|-------------|
| REG-080 | Messages re-encrypted after migration | All messages use new ECDH keys post-authenticate | Jest unit | `features/auth/services/__tests__/guest-migration-service.test.ts` |
| REG-081 | skipEncryptedMessageUpdatesOnNextSync called | Prevents double-upload | Jest unit | `features/auth/services/__tests__/guest-migration-service.test.ts` |
| REG-082 | Conversations preserved after migration | All pre-migration data visible post-login | Maestro E2E | `flows/auth/guest-migration.yaml` |

---

## REG-P1 — High Priority (Run Before Feature Releases)

| ID | Name | What It Verifies | Test Type |
|----|------|-----------------|-----------|
| REG-100 | Pull-to-refresh triggers sync | `syncService.syncNow()` on pull | Jest unit |
| REG-101 | QR scan creates peer + navigates | Valid QR → peer upserted → Chat Room | Maestro E2E |
| REG-102 | QR missing ip/port in LAN rejected | "Invalid QR" badge 4 s | RNTL |
| REG-103 | Announcements role-filtered | Rescuer > user count | Pytest |
| REG-104 | Expired announcements excluded | Only active shown | Pytest |
| REG-105 | GPS streaming starts on enable | `GpsLocationService` WS opens | Jest unit |
| REG-106 | GPS streaming stops on disable | WS closed on toggle off | Jest unit |
| REG-107 | GPS reconnects after 3 s | Re-connects on WS drop | Jest unit |
| REG-108 | Map tab redirects non-rescuers | Non-rescuer → Chats tab | Maestro E2E |
| REG-109 | Search debounced — single API call | One call after rapid typing | Jest unit |
| REG-110 | Unknown search result creates peer | `peerService.createUser()` before navigate | Jest unit |
| REG-111 | Safe-area insets on all screens | No clipping on notched device | Maestro E2E |

---

## REG-P2 — Known Bug-Prone Area Checks

| ID | Name | What It Verifies | Test Type |
|----|------|-----------------|-----------|
| REG-200 | Self-chat always connected | Own peer → DELIVERED immediately; no TCP/WebRTC | Jest unit |
| REG-201 | Seen receipt only when focused | Not sent when screen is background | Jest unit |
| REG-202 | NetworkConfig debounced IP callback | Multiple events → one callback | Jest unit |
| REG-203 | `POST /update/profile` skips email field | Email not actually changed | Pytest |
| REG-204 | Recovery key cooldown enforced | 429 within cooldown | Pytest |
| REG-205 | Security question burned after use | `is_burned=True` after correct answer | Pytest |
| REG-206 | WsMessageParser handles unknown type | No crash on unknown `type` field | Jest unit |
| REG-207 | Server Host Override absent in prod | Drawer URL field not rendered | Maestro E2E |

---

## 5-Minute Smoke Test (Run After Every Deploy)

```
1. GET /                                       → {"state": "running"} ✓
2. POST /auth/ (register)                      → 200 + tokens ✓
3. POST /auth/token (login)                    → 200 + tokens ✓
4. WS /ws/?token=<access_token>               → connected + status-update:online ✓
5. Send {type: "ping"}                         → {type: "pong"} ✓
6. GET /sync/pull?last_pulled_at=0             → {changes, timestamp} ✓
7. GET /user-utils/get-announcements           → 200 ✓
8. POST /auth/logout                           → 200; JTI blacklisted ✓
```

Automate with Pytest + `websockets` library.

---

## Stub Screens — Excluded from Regression

| Screen | Reason |
|--------|--------|
| `/settings/preferences/notifications` | Stub only ("Notifications" text) |
| `/settings/account/contacts` | Stub only ("Contacts" text) |
| Drawer "Edit Profile" button | Navigates nowhere |
| `/(drawer)/(tabs)/debug` | Hidden dev-only tab |
