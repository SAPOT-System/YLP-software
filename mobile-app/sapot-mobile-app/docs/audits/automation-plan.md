# Automation Plan — SAPOT Mobile App

Generated: 2026-06-20

---

## Framework Selection

| Layer | Framework | Rationale |
|-------|-----------|-----------|
| Unit tests (TypeScript) | **Jest** + `jest-expo` | Already configured; global mocks in `jest-setup.js`; path alias `@/`; supports real `tweetnacl` without mocking |
| Component tests (React) | **RNTL** (React Native Testing Library) | Already in use; `render`, `fireEvent`, `renderHook` patterns established |
| E2E mobile tests | **Maestro** | Declarative YAML flows; excellent React Native support; MCP integration available; runs on Android emulator + device |
| Backend API tests | **Pytest** + FastAPI `TestClient` | Native to FastAPI; in-process (no network); fixture-based DB seeding |
| Backend WebSocket tests | **Pytest** + `pytest-asyncio` + `httpx` WS client | Async WS support; pairs with `TestClient` |

---

## Phase 1 — Fix Critical Security Bugs (Week 1)

These are active production bugs. Fix before writing any tests.

| Task | Action |
|------|--------|
| Remove testing endpoints from production | Delete `testing.py` from router registration in `server/app/main.py` |
| Add auth to GPS monitor WS | Add JWT validation to `/gps/ws/monitor/rescuers/{id}` in `server/app/api/gps.py` |
| Rate-limit `/auth/exists` | Add `@limiter.limit("30/minute")` in `server/app/api/auth.py` |
| Fix captive portal NameError | Rename `db` → `session` in `disconnect_guest_session` in `server/app/api/captive_portal.py` |
| Confirm with Pytest | `server/tests/test_security.py` covering REG-070–REG-073 |

---

## Phase 2 — Backend API Tests (Weeks 2–3)

The backend is 100% untested. Start here: stateless, easy to isolate, highest security risk.

**Target:** 80% endpoint coverage with Pytest.

### Conftest setup

```python
# server/tests/conftest.py
import pytest
from fastapi.testclient import TestClient
from app.main import app

@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c

@pytest.fixture
def auth_headers(client):
    client.post("/auth/", json={
        "username": "testuser", "firstName": "T", "lastName": "U",
        "password": "password123", "terms_accepted": True
    })
    r = client.post("/auth/token", data={"username": "testuser", "password": "password123"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}

@pytest.fixture
def admin_headers(client):
    # Seed admin role directly via DB (never via /testing/ endpoint)
    ...
```

### Test file execution order

1. `tests/test_security.py` — critical bugs (API-220–226)
2. `tests/test_auth.py` — registration, login, refresh, logout (API-010–036)
3. `tests/test_sync.py` — WatermelonDB pull/push protocol (API-140–149)
4. `tests/test_keys.py` — ECDH keys + wrapped keys (API-100–117)
5. `tests/test_ws_signaling.py` — WebSocket signaling (API-160–175)
6. `tests/test_gps.py` — GPS streaming + REST (API-150–158)
7. `tests/test_admin.py` — admin CRUD (API-180–194)
8. `tests/test_forgot_password.py` — all reset flows (API-050–075)
9. `tests/test_gsm.py` — GSM/SMS using mock endpoints (API-200–210)
10. `tests/test_captive_portal.py` — captive portal (API-250–255)

---

## Phase 3 — Unit Tests for Untested Services (Weeks 3–5)

### Mock pattern to follow (from existing tests)

```typescript
// From features/shared/services/__tests__/connection-service.test.ts
import { createConnectionServiceDependencyMocks } from '@/test/mocks/service.mock-builders'
import { ConnectionService } from '../connection-service'

describe('ConnectionService', () => {
  let mocks: ReturnType<typeof createConnectionServiceDependencyMocks>
  let service: ConnectionService

  beforeEach(() => {
    mocks = createConnectionServiceDependencyMocks()
    service = new ConnectionService(mocks)
  })

  it('...', () => { ... })
})
```

### Encryption services (CRITICAL — write first)

| Service | Target Test File |
|---------|-----------------|
| `LocalEncryptionService` | `features/shared/services/__tests__/local-encryption-service.test.ts` |
| `KeyDerivation` | `features/shared/services/__tests__/key-derivation.test.ts` |
| `TcpEncryptionService` | `features/shared/services/__tests__/tcp-encryption.test.ts` |
| `WsEncryptionService` | `features/shared/services/__tests__/ws-encryption.test.ts` |
| `PeerKeyService` | `features/shared/services/__tests__/peer-key-service.test.ts` |
| `KeyRecoveryService` | `features/shared/services/__tests__/key-recovery-service.test.ts` |

### Other high-risk services

| Service | Target Test File |
|---------|-----------------|
| `WsSignalingAdapter` | `features/shared/adapters/__tests__/ws-signaling-adapter.test.ts` |
| `AppModeStore` | `features/shared/stores/__tests__/app-mode-store.test.ts` |
| `SyncService` | `features/sync/services/__tests__/sync-service.test.ts` |
| `GpsLocationService` | `features/gps/services/__tests__/gps-location-service.test.ts` |
| `GuestMigrationService` | `features/auth/services/__tests__/guest-migration-service.test.ts` |
| `SignalingService` | `features/shared/services/__tests__/signaling-service.test.ts` |
| `SIGNALING_TASK` | `task/__tests__/signaling-task.test.ts` |
| `use-lockout-timer` | `features/auth/hooks/__tests__/use-lockout-timer.test.ts` |

### Pure functions — highest ROI, lowest effort (< 30 min each)

| Function | Target Test File |
|----------|-----------------|
| `haversine(lat1, lng1, lat2, lng2)` | `features/gps/utils/__tests__/haversine.test.ts` |
| `formatRelativeTime(ts)` | `features/gps/utils/__tests__/format-relative-time.test.ts` |
| `formatAnnouncementDate(ts)` | `features/announcements/utils/__tests__/format-announcement-date.test.ts` |
| `directConversationId(a, b)` | `features/chat/utils/__tests__/direct-conversation-id.test.ts` |
| `smsConversationId(phone)` | `features/chat/utils/__tests__/sms-conversation-id.test.ts` |
| `extractResetToken(url)` | `features/auth/utils/__tests__/extract-reset-token.test.ts` |
| `generateGuestUsername()` | `features/auth/utils/__tests__/guest-username-generator.test.ts` |
| `formatDate(ts)` | `features/shared/utils/__tests__/format-date.test.ts` |

---

## Phase 4 — Maestro E2E Flows (Weeks 5–7)

### Project structure

```
mobile-app/sapot-mobile-app/.maestro/
  auth/
    server-login.yaml
    guest-login.yaml
    register.yaml
    logout.yaml
    guest-migration.yaml
  chat/
    send-message.yaml
  call/
    accept-call.yaml
    reject-call.yaml
    end-call.yaml
  notifications/
    background-call.yaml
    cold-start-call.yaml
  regression/
    smoke-test.yaml
```

### Canonical flow example

```yaml
# .maestro/auth/server-login.yaml
appId: com.sapot.mobile.dev
---
- launchApp
- tapOn: "Server"
- tapOn: "Proceed"
- assertVisible: "Login"
- inputText:
    id: "username-input"
    text: "${USERNAME}"
- inputText:
    id: "password-input"
    text: "${PASSWORD}"
- tapOn: "Login"
- assertVisible: "Chats"
```

### E2E flow priority order

| Priority | Flow | REG IDs |
|----------|------|---------|
| P0 | Server login | REG-001 |
| P0 | Guest login (tab visibility) | REG-002, REG-012, REG-013, REG-014 |
| P0 | Logout | REG-004 |
| P0 | Accept incoming call | REG-030 |
| P0 | Reject incoming call | REG-031 |
| P0 | End call | REG-035 |
| P0 | Background call notification | REG-052 |
| P0 | Cold-start from notification | REG-053 |
| P0 | Guest migration | REG-082 |
| P1 | Send chat message | REG-020 (integration) |
| P1 | QR scan → Chat Room | REG-101 |
| P1 | Map tab for rescuer | REG-108 |
| P1 | Safe-area on all screens | REG-111 |
| P2 | Server Host Override absent in prod | REG-207 |

---

## Phase 5 — RNTL Component Tests (Weeks 7–8)

Target screens with business-rule rendering. Follow this pattern:

```typescript
import { render } from '@testing-library/react-native'
import { createUserContainerWrapper } from '@/test/mocks/auth-container-context.mock'

it('hides Public Chat tab for guests', () => {
  const { queryByText } = render(
    <TabLayout />,
    { wrapper: createUserContainerWrapper({ isGuest: true }) }
  )
  expect(queryByText('Public Chat')).toBeNull()
})
```

### Target components

| Component | Key Scenarios |
|-----------|--------------|
| `app/(drawer)/(tabs)/_layout.tsx` | Tab visibility per user type |
| `app/auth/login/server-login.tsx` | LockoutBanner, BannedBanner, AttemptsWarning |
| `app/auth/login/lan-login.tsx` | Field validation, no server call |
| `app/(drawer)/(tabs)/call/incoming.tsx` | Caller info, accept/reject buttons |
| `features/chat/components/chat-room.tsx` | Connection state indicators |
| `features/shared/components/server-status-banner.tsx` | Shown/hidden per transport mode |
| `features/shared/components/offline-expired-banner.tsx` | Shown when session offline+expired |

---

## CI Integration

```yaml
# .github/workflows/test.yml
jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm test -- --coverage --coverageThreshold='{"global":{"lines":80}}'
      - run: npm run typecheck
      - run: npm run lint

  api-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pip install -r server/requirements.txt
      - run: pytest server/tests/ -v --tb=short

  e2e-smoke:
    runs-on: ubuntu-latest
    steps:
      - uses: reactivecircus/android-emulator-runner@v2
        with:
          api-level: 34
          script: maestro test .maestro/regression/smoke-test.yaml
```

---

## Coverage Targets

| Layer | Current | After Phase 3 | After Phase 5 |
|-------|---------|---------------|---------------|
| Business logic (Jest) | ~18% | 65% | 80% |
| UI components (RNTL) | ~5% | 30% | 60% |
| Backend API (Pytest) | 0% | 75% | 85% |
| E2E flows (Maestro) | 0 | 10 flows | 15 flows |

---

## Mock Strategy for New Tests

| Scenario | Pattern | Reference |
|----------|---------|-----------|
| Service with DI | `createXxxDependencyMocks()` from `test/mocks/service.mock-builders.ts` | `call-service.test.ts` |
| WatermelonDB repo | `createCollectionMock()` + `createWatermelonDbMock()` | `message-repository.test.ts` |
| Hook with context | `createUserContainerWrapper()` | `use-auth-container.test.tsx` |
| NaCl crypto | Use REAL `nacl.randomBytes()` / `nacl.box.keyPair()` — do NOT mock | `conversation-key-store.test.ts` |
| Axios API calls | `createMockAxiosInstance()` | `client.test.ts` |
| expo-secure-store | Add to `jest-setup.js`: `jest.mock('expo-secure-store', () => ({getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn()}))` | New |
| expo-location | Add to `jest-setup.js`: `jest.mock('expo-location', () => ({requestForegroundPermissionsAsync: jest.fn(), watchPositionAsync: jest.fn()}))` | New |
| Time-dependent tests (cooldowns) | Use `jest.useFakeTimers()` + `jest.setSystemTime()` | New |

---

## What NOT to Automate

| Item | Reason |
|------|--------|
| Theme visual appearance | Manual QA; color accuracy not verifiable headless |
| OTA update delivery | EAS platform; outside app code |
| Bluetooth audio routing | Device-specific; no reliable emulator support |
| Real SMS delivery | Use `/gsm/mock/*` endpoints in tests |
| Map tile rendering | MapLibre visual output; manual QA only |
| 30-day recovery key cooldown | Wall-clock time; mock with `jest.setSystemTime()` |
| 90-day security question cooldown | Same — mock time |
| Android notification exact appearance | OS-rendered; verify shown, not appearance |

---

## Estimated Effort

| Phase | Duration | Output |
|-------|----------|--------|
| 1 — Security fixes | 1 week | 4 bug fixes + 5 Pytest tests |
| 2 — Backend API | 2 weeks | ~100 Pytest tests |
| 3 — Unit tests | 3 weeks | ~80 Jest tests |
| 4 — E2E Maestro | 2 weeks | 15 Maestro flows |
| 5 — RNTL components | 1 week | ~30 RNTL tests |
| **Total** | **9 weeks** | **~230 tests; 80%+ coverage** |
