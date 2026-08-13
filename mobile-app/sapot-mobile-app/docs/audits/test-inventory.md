# Test Inventory — SAPOT Mobile App

Revised: 2026-06-20
Scope: React Native / Expo frontend + FastAPI backend

## Execution Type Definitions

| Type | Definition |
|------|-----------|
| **AUTOMATED** | Runs in CI without human intervention or physical device (Jest, RNTL, Pytest, pytest-asyncio) |
| **HYBRID** | Scripted but requires a real device or emulator at runtime (Maestro flows, WS integration) |
| **MANUAL** | Requires a human tester on a physical device with real network conditions, hardware, or OS-level state that cannot be scripted |

---

## Coverage Summary

| Area | Features | Existing Tests | Coverage Status |
|------|----------|---------------|-----------------|
| Auth flows | 18 hooks/utils/components | 17 test files | Partial — missing register, lockout timer, all reset hooks |
| Chat | 6 services/repos/hooks | 9 test files | Partial — missing public-chat service, chat hooks, ID utils |
| Call | 3 services/hooks/repos | 1 test file | Low — only CallService unit test |
| Shared services | 12 services | 7 test files | Low — encryption services, signaling, WebRTC all untested |
| Shared adapters | 5 adapters | 5 test files | Good — all 5 adapters covered |
| Shared stores | 4 stores | 3 test files | Partial — AppModeStore, SecureConfig untested |
| GPS feature | 5 hooks/services/utils | 0 test files | **ZERO** |
| Announcements | 3 hooks/utils | 0 test files | **ZERO** |
| Sync | 1 service + 1 API | 0 test files | **ZERO** |
| Settings | 8 components/hooks | 0 test files | **ZERO** |
| Screen components | 36 screens | 0 test files | **ZERO** |
| E2E flows | 10 critical user journeys | 0 Maestro flows | **ZERO** |
| Backend API | 80+ endpoints | 0 Python tests | **ZERO** |

**Estimated overall coverage: ~18% of business logic, 0% of UI, 0% of backend**

---

## Feature Inventory

### 1. Authentication

| Sub-Feature | File(s) | Test File | Status | Execution Type |
|-------------|---------|-----------|--------|----------------|
| Server login | `features/auth/context/auth-context.tsx` | `auth-context.test.tsx` | Partial | AUTOMATED |
| Guest (LAN) login | `auth-container.ts` | `auth-container.test.ts` | Partial | AUTOMATED |
| Registration | `hooks/use-register.ts` | None | Missing | AUTOMATED |
| Forgot password — email | `hooks/use-email-reset.ts` | None | Missing | AUTOMATED |
| Forgot password — SMS | `hooks/use-sms-reset.ts` | None | Missing | AUTOMATED |
| Forgot password — security question | `hooks/use-verify-question.ts` | `use-verify-question.test.ts` | Partial (attemptsRemaining only) | AUTOMATED |
| Forgot password — recovery key | `hooks/use-verify-recovery-key.ts` | None | Missing | AUTOMATED |
| Password reset | `hooks/use-change-password.ts` | `use-change-password.test.ts` | Minimal (recovery token only) | AUTOMATED |
| Lockout timer | `hooks/use-lockout-timer.ts` | None | Missing | AUTOMATED |
| Recovery key setup | `hooks/use-recovery-key-setup.ts` | None | Missing | AUTOMATED |
| Recovery constraints | `hooks/use-recovery-constraints.ts` | None | Missing | AUTOMATED |
| Email verification | `hooks/use-validate-identifier.ts` | None | Missing | AUTOMATED |
| Token utilities | `utils/token-utils.ts` | `token-utils.test.ts` | Good | AUTOMATED |
| Form validation | `utils/validation.ts` | `validation.test.ts` | Partial (guest only) | AUTOMATED |
| Guest migration | `services/guest-migration-service.ts` | None | Missing | AUTOMATED |
| Auth API | `api/` | `auth.api.test.ts` | Minimal (reset password only) | AUTOMATED |

### 2. Chat

| Sub-Feature | File(s) | Test File | Status | Execution Type |
|-------------|---------|-----------|--------|----------------|
| ChatService (P2P) | `chat/services/chat-service.ts` | `chat-service.test.ts` | Partial | AUTOMATED |
| PublicChatService | `chat/services/public-chat-service.ts` | None | Missing | AUTOMATED |
| MessageRepository | `chat/repositories/message-repository.ts` | `message-repository.test.ts` | Good | AUTOMATED |
| ConversationRepository | `chat/repositories/conversation-repository.ts` | `conversation-repository.test.ts` | Good | AUTOMATED |
| ConversationParticipantRepository | | `conversation-participant-repository.test.ts` | Good | AUTOMATED |
| MessageStatusRepository | | `message-status-repository.test.ts` | Good | AUTOMATED |
| ConversationKeyStore | | `conversation-key-store.test.ts` | Good | AUTOMATED |
| MessageReceiptManager | | `message-receipt-manager.test.ts` | Good | AUTOMATED |
| ID utilities | `utils/direct-conversation-id.ts` etc. | None | Missing | AUTOMATED |
| Chat hooks | `hooks/use-chats.ts`, `use-chat-service.ts` | None | Missing | AUTOMATED |
| Public chat API | `api/public-chat.api.ts` | None | Missing | AUTOMATED |
| Chat send on real P2P network | Real TCP/WebRTC | None | Missing | HYBRID |
| Message delivery on unstable link | Real 30% packet loss | None | Missing | MANUAL |

### 3. Call

| Sub-Feature | File(s) | Test File | Status | Execution Type |
|-------------|---------|-----------|--------|----------------|
| CallService | `call/services/call-service.ts` | `call-service.test.ts` | Good | AUTOMATED |
| CallRepository | `call/repositories/call-repository.ts` | None | Missing | AUTOMATED |
| CallParticipantRepository | | None | Missing | AUTOMATED |
| CallMessageRouter | `shared/services/call-message-router.ts` | `call-message-router.test.ts` | Good | AUTOMATED |
| Call context | `call/context/call-context.tsx` | None | Missing | AUTOMATED |
| Call hooks | `call/hooks/` | None | Missing | AUTOMATED |
| Audio call on real device | Real mic/speaker | None | Missing | MANUAL |
| Video call on real device | Real camera | None | Missing | MANUAL |
| Call under WiFi → cellular handover | Real network | None | Missing | MANUAL |
| ICE reconnect on mid-call drop | Real network disruption | None | Missing | HYBRID |

### 4. Shared — Services

| Sub-Feature | File(s) | Test File | Status | Execution Type |
|-------------|---------|-----------|--------|----------------|
| ConnectionService | `services/connection-service.ts` | `connection-service.test.ts` | Partial | AUTOMATED |
| DiscoveryService | `services/discovery-service.ts` | `discovery-service.test.ts` | Good | AUTOMATED |
| NotificationService | `services/notification-service.ts` | `notification-service.test.ts` | Good | AUTOMATED |
| PeerService | `services/peer-service.ts` | `peer-service.test.ts` | Good | AUTOMATED |
| UserService | `services/user-service.ts` | `user-service.test.ts` | Good | AUTOMATED |
| CleanUpService | `services/clean-up-service.ts` | `clean-up-service.test.ts` | Good | AUTOMATED |
| ActiveUsersService | `services/active-users-service.ts` | None | Missing | AUTOMATED |
| SignalingService | `services/signaling-service.ts` | None | Missing | AUTOMATED |
| WebrtcSessionManager | `services/webrtc-session-manager.ts` | None | Missing | AUTOMATED |
| CallMediaService | `services/call-media-service.ts` | None | Missing | AUTOMATED |

### 5. Shared — Encryption (all CRITICAL risk)

| Sub-Feature | File(s) | Test File | Status | Execution Type | Risk |
|-------------|---------|-----------|--------|----------------|------|
| LocalEncryptionService | `services/local-encryption-service.ts` | None | Missing | AUTOMATED | CRITICAL |
| TcpEncryptionService | `services/tcp-encryption.ts` | None | Missing | AUTOMATED | CRITICAL |
| WsEncryptionService | `services/ws-encryption.ts` | None | Missing | AUTOMATED | CRITICAL |
| PeerKeyService | `services/peer-key-service.ts` | None | Missing | AUTOMATED | HIGH |
| PeerKeyStore | `services/peer-key-store.ts` | None | Missing | AUTOMATED | HIGH |
| KeyDerivation | `services/key-derivation.ts` | None | Missing | AUTOMATED | CRITICAL |
| KeyRecoveryService | `services/key-recovery-service.ts` | None | Missing | AUTOMATED | HIGH |
| At-rest data visibility | Physical device forensics | None | Missing | MANUAL | CRITICAL |

### 6. Shared — Adapters

| Sub-Feature | File(s) | Test File | Status | Execution Type |
|-------------|---------|-----------|--------|----------------|
| TcpClientAdapter | `adapters/tcp-client-adapter.ts` | `tcp-client-adapter.test.ts` | Good | AUTOMATED |
| TcpServerAdapter | `adapters/tcp-server-adapter.ts` | `tcp-server-adapter.test.ts` | Good | AUTOMATED |
| WsSignalingAdapter | `adapters/ws-signaling-adapter.ts` | None | Missing | AUTOMATED |
| WebrtcAdapter | `adapters/webrtc-adapter.ts` | `webrtc-adapter.test.ts` | Partial | AUTOMATED |
| ZeroconfAdapter | `adapters/zeroconf-adapter.ts` | `zeroconf-adapter.test.ts` | Good | AUTOMATED |
| WsMessageParser | `adapters/ws-signaling-adapter.ts` | `ws-message-parser.test.ts` | Good | AUTOMATED |

### 7. GPS Feature (zero coverage)

| Sub-Feature | File(s) | Test File | Status | Execution Type | Risk |
|-------------|---------|-----------|--------|----------------|------|
| GpsLocationService | `gps/services/gps-location-service.ts` | None | Missing | AUTOMATED | HIGH |
| useGpsStreaming | `gps/hooks/useGpsStreaming.ts` | None | Missing | AUTOMATED | HIGH |
| useLatestLocations | `gps/hooks/useLatestLocations.ts` | None | Missing | AUTOMATED | MEDIUM |
| useGpsHistory | `gps/hooks/useGpsHistory.ts` | None | Missing | AUTOMATED | MEDIUM |
| useLocationPermission | `gps/hooks/useLocationPermission.ts` | None | Missing | AUTOMATED | MEDIUM |
| haversine distance | `gps/utils/haversine.ts` | None | Missing | AUTOMATED | LOW (pure fn) |
| format-relative-time | `gps/utils/format-relative-time.ts` | None | Missing | AUTOMATED | LOW (pure fn) |
| GPS preference context | `gps/components/gps-preference-context.tsx` | None | Missing | AUTOMATED | MEDIUM |
| GPS on real device (permission flow) | Physical device | None | Missing | MANUAL | HIGH |
| GPS accuracy on network-only location | No GPS fix | None | Missing | MANUAL | MEDIUM |

### 8. Sync Feature (zero coverage)

| Sub-Feature | File(s) | Test File | Status | Execution Type | Risk |
|-------------|---------|-----------|--------|----------------|------|
| SyncService | `sync/services/sync-service.ts` | None | Missing | AUTOMATED | HIGH |
| Sync API | `sync/api/sync.api.ts` | None | Missing | AUTOMATED | HIGH |
| Sync on unstable connection | Real network | None | Missing | MANUAL | HIGH |

### 9. Announcements Feature (zero coverage)

| Sub-Feature | File(s) | Test File | Status | Execution Type |
|-------------|---------|-----------|--------|----------------|
| Announcements API | `announcements/api.ts` | None | Missing | AUTOMATED |
| useAnnouncements | `announcements/hooks/use-announcements.ts` | None | Missing | AUTOMATED |
| useAnnouncementNewCount | `announcements/hooks/use-announcement-new-count.ts` | None | Missing | AUTOMATED |
| format-announcement-date | `announcements/utils/format-announcement-date.ts` | None | Missing | AUTOMATED |

### 10. Android Foreground Service (zero coverage)

| Sub-Feature | File(s) | Test File | Status | Execution Type | Risk |
|-------------|---------|-----------|--------|----------------|------|
| Android foreground-service lifecycle | `hooks/use-foreground-service.ts` | None | Missing | AUTOMATED | HIGH |
| Foreground service under Android Doze | Real device, battery saver | None | Missing | MANUAL | HIGH |

---

## Screens with Zero Test Coverage

| Screen | Route | Priority | Execution Type |
|--------|-------|----------|----------------|
| Getting Started | `/getting-started` | HIGH | HYBRID |
| Server Login | `/auth/login/server-login` | CRITICAL | AUTOMATED (RNTL) + HYBRID (Maestro) |
| LAN Login | `/auth/login/lan-login` | CRITICAL | AUTOMATED (RNTL) + HYBRID (Maestro) |
| Register | `/auth/register` | CRITICAL | HYBRID |
| Forgot Password (6 screens) | `/auth/forgot-password/*` | HIGH | HYBRID |
| Chats Tab | `/(drawer)/(tabs)/index` | CRITICAL | HYBRID |
| Chat Room | `/(drawer)/(tabs)/chat/[id]` | CRITICAL | HYBRID |
| Incoming Call | `/(drawer)/(tabs)/call/incoming` | CRITICAL | HYBRID + MANUAL |
| Call Room | `/(drawer)/(tabs)/call/[id]` | CRITICAL | HYBRID + MANUAL |
| Public Chat | `/(drawer)/(tabs)/public-chat` | HIGH | HYBRID |
| Map/GPS | `/(drawer)/(tabs)/map` | HIGH | HYBRID + MANUAL |
| Settings Tab | `/(drawer)/(tabs)/settings` | HIGH | HYBRID |
| Search | `/(drawer)/search` | MEDIUM | HYBRID |
| Announcements | `/(drawer)/announcements` | MEDIUM | HYBRID |
| QR Scanner | `/(drawer)/(tabs)/scan-qr` | MEDIUM | HYBRID + MANUAL |
| Peer Profile | `/(drawer)/(tabs)/peer/[id]` | LOW | HYBRID |
| Manage Profile | `/settings/account/manage-profile` | HIGH | HYBRID |
| Password & Security | `/settings/account/password-and-security` | HIGH | HYBRID |
| Change Password | `/settings/account/change-password` | HIGH | HYBRID |
| Security Question | `/settings/account/security-question` | MEDIUM | HYBRID |
| Generate Recovery Key | `/settings/account/generate-recovery-key` | HIGH | HYBRID |
| QR Code | `/settings/account/qr-code` | LOW | HYBRID |
| Switch Mode | `/settings/account/switch-mode` | HIGH | HYBRID |
| GPS Settings | `/settings/preferences/gps` | MEDIUM | HYBRID |
| Theme Settings | `/settings/preferences/theme` | LOW | MANUAL |
| Email flows (3 screens) | `/settings/account/email/*` | MEDIUM | HYBRID |
| Phone flows (3 screens) | `/settings/account/phone/*` | MEDIUM | HYBRID |

---

## Backend — Zero Test Coverage

| Area | Endpoints | Risk | Execution Type |
|------|-----------|------|----------------|
| Auth (login, token, refresh) | 9 | CRITICAL | AUTOMATED (Pytest) |
| Forgot password flow | 16 | HIGH | AUTOMATED (Pytest) |
| WebSocket signaling | 1 WS endpoint | CRITICAL | AUTOMATED (pytest-asyncio) |
| Sync (pull/push) | 2 | CRITICAL | AUTOMATED (Pytest) |
| GPS WebSocket | 2 WS endpoints | HIGH | AUTOMATED (pytest-asyncio) |
| Keys/ECDH | 6 | HIGH | AUTOMATED (Pytest) |
| Admin role management | 6 | HIGH | AUTOMATED (Pytest) |
| Testing endpoints (no auth) | 2 | CRITICAL — security | AUTOMATED (Pytest) |
| CORS + credentials behavior | Config | HIGH | MANUAL (browser + real origin) |
| JWT secret in production | Config | CRITICAL | MANUAL (env audit) |

---

## Critical Security Issues (Found During Inventory)

1. **`/testing/test-make-admin` and `/testing/test-make-rescuer`** — no authentication, included in production router. Any unauthenticated request can grant admin or rescuer privileges.
2. **`/gps/ws/monitor/rescuers/{rescuer_id}`** — GPS location monitor WebSocket has no authentication. Any client can receive all user GPS coordinates.
3. **`/auth/exists`** — no rate limiting; enables username and email enumeration at scale.
4. **JWT secret fallback** — hardcoded fallback value used when `JWT_SECRET_KEY` env var is not set in production.
5. **CORS fully open** — `allow_origins=["*"]` combined with `allow_credentials=True` is an invalid CORS configuration per spec; credentials are silently dropped by browsers.
6. **Captive portal** — no authentication on any endpoint; any host on the network can create or modify guest sessions.
7. **Admin refresh uses cookie only** — inconsistent with Bearer token auth used by all other admin endpoints.
8. **Server Host Override in drawer** — UI text field visible to all users allows runtime override of the API base URL, enabling MITM attacks.
9. **Captive portal `db` NameError** — `disconnect_guest_session` references `db` but the dependency is named `session`; the PATCH endpoint crashes at runtime.
10. **Duplicate `NAMESPACE` in gsm.py** — variable defined twice; the second definition silently shadows the first.
