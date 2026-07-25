# Remove the Encryption PIN — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fully remove the "encryption PIN" feature from the SAPOT mobile app — the launch-time PIN gate, the settings screen, and all PIN-derived local key wrapping — leaving the at-rest key protected exactly as it is in no-PIN mode today.

**Architecture:** The PIN was never part of the authoritative at-rest key. The server-side wrapped key blob is always derived from `password + userId` (PBKDF2, 200k iters); the PIN's *only* role was wrapping a **local SecureStore cache copy** of the key bundle. Removing the PIN collapses the code to the already-existing "no-PIN fast path": the key bundle is fetched from the server (password KEK), applied, and cached in SecureStore as plaintext protected by the OS hardware keystore. No server change is required.

**Tech Stack:** Expo / React Native / TypeScript, `expo-router`, `expo-secure-store`, `tweetnacl`, WatermelonDB. Jest for tests. Component: `mobile-app/sapot-mobile-app/`.

## Global Constraints

- **Owning component:** `mobile-app/sapot-mobile-app/` only. No server/admin change — the `/users/wrapped-key` endpoint and its password-only KEK are unchanged. (Root CLAUDE.md: mobile has its own API client; do not touch sibling components.)
- **Migration policy (decided): HARD REMOVAL, pre-release.** Assume no production user has the PIN enabled. Do **not** add any migration/downgrade path for existing PIN-enabled installs. A device that had the PIN enabled loses its local plaintext key cache and re-fetches from the server on next authenticated launch (or re-login).
- **Crypto/security-sensitive:** `features/shared/crypto/` and `features/shared/core/stores/secure-config.ts` are the highest-blast-radius dirs (mobile CLAUDE.md). Audit all consumers before changing shared signatures. Issue #152 carries the `security-review` label — a `security-reviewer` pass is mandatory before the final commit (see Verification).
- **Do not** change `.bind()`/closure wiring in DI, introduce a second pattern, or reformat files outside the diff. `any` banned except test mocks. Match existing code style.
- **Commit convention:** `type(scope): summary` (repo CONTRIBUTING.md), e.g. `refactor(crypto): ...`. Work on a `feature/` or `chore/` branch — never commit to `main`/`develop` directly.
- **Verification per touched area:** `npm test`, `npm run typecheck`, `npm run lint` (full gate: `npm run testAll`). Keep the build green at every commit.

---

## File Structure

**Delete (2):**
- `features/auth/components/pin-entry-gate.tsx` — the full-screen 6-digit gate component.
- `app/(drawer)/settings/account/encryption-pin.tsx` — the PIN settings screen (Expo Router auto-route; not in any `_layout.tsx`, so deleting the file removes the route).

**Modify (7):**
- `features/shared/core/context/main-container-context.tsx` — remove the launch-time PIN gate.
- `app/(drawer)/settings/account/password-and-security.tsx` — remove the "Encryption PIN" list item + its state.
- `config/routes.ts` — remove the `ENCRYPTION_PIN` route constant.
- `features/shared/main-container.ts` — remove `_pendingRawPIN`, `setPendingPIN`, and the `getPIN` ctx field.
- `features/shared/crypto/local-encryption-service.ts` — remove all PIN branches, `unlockFromPinBlob`, `saveLocalPinCache`, the PIN-management methods, and the `getPIN` ctx field; simplify `cacheKeys`/`initFromServer`/`updateMasterKeyPassword`.
- `features/shared/core/stores/secure-config.ts` — remove the `PIN_ENABLED` / `PIN_WRAPPED_BUNDLE` keys and their 4 accessors.
- `features/shared/crypto/__tests__/local-encryption-service.test.ts` — remove PIN mocks/stubs and the "PIN management" block.

**Docs (update, non-code):** `docs/ARCHITECTURE.md`, `docs/ONBOARDING.md`, `docs/STATE_MANAGEMENT.md`, `docs/diagrams/08-encryption-decryption-flow.md`, `docs/audits/test-inventory.md`, `docs/audits/test-cases.md` (mobile). Plus a grep sweep of repo-root `../../docs/` for stragglers.

**Task order rationale:** UI/navigation first (Tasks 1–2) so no screen references the crypto methods we delete next; then the security-sensitive crypto core with tests (Task 3); then docs (Task 4); then security review + full gate (Task 5). The build compiles and tests pass after every task.

---

### Task 1: Remove the launch-time PIN gate

Deletes the gate component and the startup branch that defers `MainContainer.initialize()` behind a PIN. After this, an authenticated non-guest launch calls `initialize()` directly.

**Files:**
- Delete: `features/auth/components/pin-entry-gate.tsx`
- Modify: `features/shared/core/context/main-container-context.tsx`

**Interfaces:**
- Consumes: `MainContainer.initialize()` (unchanged). `setPendingPIN`, `getPinEnabled` still exist after this task (removed in Task 3) — just stop importing/calling them here.
- Produces: a `MainContainerProvider` with no `needsPin` state and no `PinEntryGate` render path.

- [ ] **Step 1: Delete the gate component**

```bash
git rm features/auth/components/pin-entry-gate.tsx
```

- [ ] **Step 2: Edit `main-container-context.tsx` — remove PIN imports**

Remove these two imports (lines ~2 and ~8) and drop `setPendingPIN` from the main-container import on line ~7:

```ts
// DELETE:
import { PinEntryGate } from "@/features/auth/components/pin-entry-gate";
import { getPinEnabled } from "../stores/secure-config";
// CHANGE line ~7 from:
import { MainContainer, setPendingPIN, setResetRequestedCallback } from "../../main-container";
// to:
import { MainContainer, setResetRequestedCallback } from "../../main-container";
```

- [ ] **Step 3: Remove `needsPin` state and its reset**

Delete `const [needsPin, setNeedsPin] = useState(false);` (line ~25) and the `setNeedsPin(false);` line inside the effect (line ~32).

- [ ] **Step 4: Remove the gating branch in `init()`**

Delete this block (lines ~53–58) so the container always initializes inline:

```ts
// DELETE:
const pinEnabled = await getPinEnabled();
if (pinEnabled && !userContainer.userStore.isGuest) {
  pendingContainerRef.current = c;
  setNeedsPin(true);
  return;
}
```

`pendingContainerRef` becomes unused — remove its declaration (line ~27) and the `pendingContainerRef.current = null;` in the cleanup return (line ~74).

- [ ] **Step 5: Remove `handlePinSubmit` and the gate render**

Delete the entire `handlePinSubmit` function (lines ~84–99) and the render branch:

```ts
// DELETE:
if (needsPin) {
  return <PinEntryGate onSubmit={handlePinSubmit} />;
}
```

- [ ] **Step 6: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS, no unused-import / unused-var errors for `PinEntryGate`, `getPinEnabled`, `needsPin`, `pendingContainerRef`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(auth): remove launch-time encryption PIN gate"
```

---

### Task 2: Remove the Encryption PIN settings screen & navigation

Deletes the settings screen and the only navigation entry point to it, plus the route constant.

**Files:**
- Delete: `app/(drawer)/settings/account/encryption-pin.tsx`
- Modify: `app/(drawer)/settings/account/password-and-security.tsx`
- Modify: `config/routes.ts`

**Interfaces:**
- Consumes: `SETTINGS_ROUTES` (minus `ENCRYPTION_PIN`). After this task, `LocalEncryptionService.isPINEnabled/setupPIN/changePIN/removePIN` have **no callers** outside the test file (deleted in Task 3).
- Produces: a `PasswordAndSecurity` screen with three items (Change Password, Security Question, Generate Recovery Key) and no `localEncryptionService` dependency.

- [ ] **Step 1: Delete the settings screen**

```bash
git rm "app/(drawer)/settings/account/encryption-pin.tsx"
```

- [ ] **Step 2: Remove the route constant**

In `config/routes.ts`, delete the `ENCRYPTION_PIN` entry (line ~29) from `SETTINGS_ROUTES`:

```ts
// DELETE:
ENCRYPTION_PIN: "/(drawer)/settings/account/encryption-pin",
```

- [ ] **Step 3: Strip PIN from `password-and-security.tsx`**

Remove the container hook, the `pinEnabled` state, and the effect body that reads it. Change the top of the component from:

```ts
export default function PasswordAndSecurity() {
  const theme = useTheme();
  const { localEncryptionService } = useMainContainer();
  const [pinEnabled, setPinEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    uiLog.info("[PasswordAndSecurity] mounted");

    localEncryptionService.isPINEnabled().then((enabled) => {
      setPinEnabled(enabled);
    });

    return () => {
      uiLog.info("[PasswordAndSecurity] unmounted");
    };
  }, [localEncryptionService]);
```

to:

```ts
export default function PasswordAndSecurity() {
  const theme = useTheme();

  useEffect(() => {
    uiLog.info("[PasswordAndSecurity] mounted");
    return () => {
      uiLog.info("[PasswordAndSecurity] unmounted");
    };
  }, []);
```

Then remove the now-unused imports `useMainContainer` and `useState` (verify `useState` is not used elsewhere in the file — it is not).

- [ ] **Step 4: Delete the "Encryption PIN" list item**

Remove the entire final `<Pressable>` block (lines ~73–96, the one pushing `SETTINGS_ROUTES.ENCRYPTION_PIN` with the On/Off badge). The `<Divider />` on line ~72 was the separator *before* it — the preceding "Generate Recovery Key" item is now last, so also remove that trailing `<Divider />` so the list doesn't end on a divider.

- [ ] **Step 5: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS. No unused `useState` / `useMainContainer` / `pinEnabled`; no reference to `ENCRYPTION_PIN`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(settings): remove Encryption PIN screen and navigation"
```

---

### Task 3: Remove PIN logic from the crypto core (security-sensitive)

Collapse `LocalEncryptionService` to the no-PIN path, delete the PIN accessors from `secure-config`, and drop `setPendingPIN`/`_pendingRawPIN`/`getPIN` from the DI wiring. **Update the test first (TDD), watch it fail against the old code's still-present PIN mocks, then remove the code.**

**Files:**
- Test: `features/shared/crypto/__tests__/local-encryption-service.test.ts`
- Modify: `features/shared/crypto/local-encryption-service.ts`
- Modify: `features/shared/core/stores/secure-config.ts`
- Modify: `features/shared/main-container.ts`

**Interfaces:**
- Produces (final `LocalEncryptionCtx`):
  ```ts
  interface LocalEncryptionCtx {
    getPassword: () => string | null;
    userId: string | null;
  }
  ```
- Produces (final private helper signatures):
  ```ts
  private async initFromServer(password: string, userId: string): Promise<void>
  private async cacheKeys(bundle: KeyBundle): Promise<void>   // writes plaintext master + signaling keys
  ```
- Consumes from `secure-config` (kept): `getMasterKey`, `saveMasterKey`, `getSignalingSecretKey`, `saveSignalingSecretKey`. Removed: `getPinEnabled`, `savePinEnabled`, `getPinWrappedBundle`, `savePinWrappedBundle`.
- The public crypto API (`encrypt`, `decrypt`, `getSignalingSecretKey`, `getMasterKeyBytes`, `setMasterKey`, `updateMasterKeyPassword`, `initialize`) is unchanged in signature.

- [ ] **Step 1: Update the test to the no-PIN shape (RED)**

Edit `features/shared/crypto/__tests__/local-encryption-service.test.ts`:

1. Remove the top import `import * as ExpoSecureStore from "expo-secure-store";` (line 1) — it is only used by the PIN block.
2. In the `secure-config` mock (lines 22–31), delete the four PIN lines so it reads:
   ```ts
   jest.mock("../../core/stores/secure-config", () => ({
     getMasterKey: jest.fn(),
     saveMasterKey: jest.fn().mockResolvedValue(undefined),
     getSignalingSecretKey: jest.fn(),
     saveSignalingSecretKey: jest.fn().mockResolvedValue(undefined),
   }));
   ```
3. In `mockSecureConfigForGuestPath()` (lines 46–50) remove the `getPinEnabled` line:
   ```ts
   function mockSecureConfigForGuestPath() {
     (SecureConfig.getMasterKey as jest.Mock).mockResolvedValue(null);
     (SecureConfig.getSignalingSecretKey as jest.Mock).mockResolvedValue(null);
   }
   ```
4. Remove `getPIN: () => null,` from every ctx stub (in the guest-init `beforeEach` ~line 97, the cached-path test ~line 184, and any others). Each ctx becomes `{ getPassword: () => ..., userId: ... }`.
5. In the cached-key-path test, delete the `(SecureConfig.getPinEnabled as jest.Mock).mockResolvedValue(false);` line (~175).
6. Delete the entire `describe("PIN management", ...)` block (lines ~194–260).
7. Add a test asserting the no-PIN fast path stays cache-only and does not touch the network:

```ts
describe("no-PIN cached path", () => {
  it("uses the plaintext SecureStore cache and never hits the server", async () => {
    const cachedMaster = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
    const cachedSignaling = "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=";
    (SecureConfig.getMasterKey as jest.Mock).mockResolvedValue(cachedMaster);
    (SecureConfig.getSignalingSecretKey as jest.Mock).mockResolvedValue(cachedSignaling);

    const service = new LocalEncryptionService({
      getPassword: () => "password",
      userId: "user-1",
    });
    await service.initialize();

    expect(service.getMasterKeyBytes()).toBeDefined();
    expect(service.getSignalingSecretKey().length).toBe(32);
  });
});
```

- [ ] **Step 2: Run the test — expect failure**

Run: `npm test -- local-encryption-service`
Expected: FAIL — the source still imports the (now-unmocked) PIN accessors and declares `getPIN` in the ctx type, and TS/lint flags the removed `getPIN` in ctx stubs. This confirms the code still depends on PIN wiring.

- [ ] **Step 3: Strip PIN from `local-encryption-service.ts`**

Apply all of the following to `features/shared/crypto/local-encryption-service.ts`:

1. Imports (lines 4–13): drop `getPinEnabled`, `savePinEnabled`, `getPinWrappedBundle`, `savePinWrappedBundle`, keeping the four master/signaling accessors.
2. `LocalEncryptionCtx` (lines 26–30): remove `getPIN`.
3. Replace `initialize()` (lines 41–78) with the no-PIN version:
   ```ts
   async initialize(): Promise<void> {
     const password = this.ctx?.getPassword() ?? null;
     const userId = this.ctx?.userId ?? null;

     // Fast path: cached plain keys in SecureStore (OS keystore-protected).
     const cachedMaster = await getMasterKey();
     const cachedSignaling = await getSignalingSecretKey();
     if (cachedMaster && cachedSignaling) {
       this.key = decodeBase64(cachedMaster);
       this.signalingKey = decodeBase64(cachedSignaling);
       return;
     }

     if (password === null || userId === null) {
       // Guest or unauthenticated — device-only key
       await this.initDeviceKey();
       return;
     }

     await this.initFromServer(password, userId);
   }
   ```
4. Replace `initFromServer` (lines 80–139) — drop the `pin`/`pinEnabled` params and the legacy `password + pin` migration branch; update `cacheKeys` calls:
   ```ts
   private async initFromServer(password: string, userId: string): Promise<void> {
     const kek = await deriveKey(password, userId, 200_000);
     let blobExists = false;

     try {
       const res = await apiClient.get<{ wrapped_blob: string }>("/users/wrapped-key");
       if (res.status === 200) {
         blobExists = true;
         const bundle = this.unwrapBundle(res.data.wrapped_blob, kek);
         if (bundle) {
           this.applyBundle(bundle);
           await this.cacheKeys(bundle);
           return;
         }
         throw new Error("MASTER_KEY_UNWRAP_FAILED");
       }
     } catch (err: unknown) {
       if (err instanceof Error && err.message === "MASTER_KEY_UNWRAP_FAILED") throw err;
       const is404 =
         err !== null &&
         typeof err === "object" &&
         "response" in err &&
         (err as { response?: { status?: number } }).response?.status === 404;
       if (!is404) throw err;
     }

     if (!blobExists) {
       const bundle = this.generateBundle();
       this.applyBundle(bundle);
       await this.uploadBundle(bundle, kek);
       await this.cacheKeys(bundle);
     }
   }
   ```
5. Delete `unlockFromPinBlob` (lines 148–166) and `saveLocalPinCache` (lines 222–232).
6. Replace `cacheKeys` (lines 208–220) with the plaintext-only version:
   ```ts
   private async cacheKeys(bundle: KeyBundle): Promise<void> {
     await saveMasterKey(bundle.chat_master_key);
     await saveSignalingSecretKey(bundle.signaling_secret_key);
   }
   ```
7. Delete the whole `// ── PIN management ──` section: `isPINEnabled`, `setupPIN`, `removePIN`, `changePIN` (lines 278–335). Also remove the now-unused `import { deleteItemAsync } from "expo-secure-store";` (line 14) — it was only used by `setupPIN`/`removePIN`.
8. Simplify `updateMasterKeyPassword` (lines 341–359):
   ```ts
   async updateMasterKeyPassword(newPassword: string): Promise<void> {
     const userId = this.ctx?.userId;
     if (!userId) throw new Error("updateMasterKeyPassword requires a userId");
     if (!this.key || !this.signalingKey) {
       throw new Error("Master key not initialized in memory");
     }
     const bundle: KeyBundle = {
       chat_master_key: encodeBase64(this.key),
       signaling_secret_key: encodeBase64(this.signalingKey),
     };
     const newKek = await deriveKey(newPassword, userId, 200_000);
     await this.uploadBundle(bundle, newKek);
     await this.cacheKeys(bundle);
   }
   ```

- [ ] **Step 4: Remove PIN accessors from `secure-config.ts`**

In `features/shared/core/stores/secure-config.ts`:
- Remove `PIN_ENABLED: "pinEnabled",` and `PIN_WRAPPED_BUNDLE: "pinWrappedBundle",` from `KEYS` (lines 24–25).
- Delete `savePinEnabled`, `getPinEnabled`, `savePinWrappedBundle`, `getPinWrappedBundle` (lines 303–337).
- Leave `MASTER_KEY`, `SIGNALING_SECRET_KEY`, `RECOVERY_TOKEN_HEX` and all recovery/lockout keys untouched.

- [ ] **Step 5: Remove PIN from DI wiring in `main-container.ts`**

In `features/shared/main-container.ts`:
- Delete `let _pendingRawPIN: string | null = null;` (line 59).
- Delete the `setPendingPIN` export (lines 66–68).
- In the `LocalEncryptionService` construction (lines 136–142), remove the `getPIN: () => _pendingRawPIN ?? "",` line so only `getPassword` and `userId` remain.
- If there is a `_pendingRawPIN = null;` reset in `cleanup()` (reported near line 319), remove it too.

- [ ] **Step 6: Run tests — expect PASS (GREEN)**

Run: `npm test -- local-encryption-service`
Expected: PASS — all remaining crypto tests green, including the new no-PIN cached-path test.

- [ ] **Step 7: Full typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS. No dangling references to `getPIN`, `setPendingPIN`, `getPinEnabled`, `savePinEnabled`, `getPinWrappedBundle`, `savePinWrappedBundle`, `unlockFromPinBlob`, `saveLocalPinCache`, or `deleteItemAsync` in the crypto service.

- [ ] **Step 8: Grep sweep to confirm zero residual references**

Run:
```bash
grep -rnE 'PinEntryGate|encryption-pin|setupPIN|isPINEnabled|removePIN|changePIN|setPendingPIN|_pendingRawPIN|unlockFromPinBlob|saveLocalPinCache|PinWrappedBundle|PinEnabled|getPIN' \
  --include='*.ts' --include='*.tsx' . | grep -v node_modules
```
Expected: no output (empty). Any hit is a leftover to fix before committing.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor(crypto): remove PIN-derived local key wrapping and DI wiring"
```

---

### Task 4: Update documentation

Bring the project docs in line with the removal. These are prose/diagram edits — no code, no test cycle.

**Files (mobile `docs/`):**
- `docs/ARCHITECTURE.md` — line ~44 ("PIN-gated initialization: the container is held in `pendingContainerRef` and `PinEntryGate` is shown before `initialize()`") rewrite to describe direct initialization; line ~50 (KeysReady note "Clears pending password/PIN") → "Clears pending password"; line ~227 feature table ("Registration, login, PIN gate, guest flow") → drop "PIN gate".
- `docs/ONBOARDING.md` — line ~15 feature table, same "drop PIN gate" edit.
- `docs/STATE_MANAGEMENT.md` — line ~220 (mentions `setPendingPIN` as global coupling) and line ~363 ("Call it from `AuthProvider` when ... PIN is unlocked") → remove the PIN references.
- `docs/diagrams/08-encryption-decryption-flow.md` — remove the "PIN lock enabled? / PIN-protected key bundle / PIN-derived key" decision nodes (the `D`/`E`/`F`/`G` branch) so the flow goes password-KEK / device-key only.
- `docs/audits/test-inventory.md` — line ~201 (`Encryption PIN | /settings/account/encryption-pin` row) → delete the row.
- `docs/audits/test-cases.md` — delete the TC-074…TC-077 rows (lines ~137–140).

- [ ] **Step 1: Sweep for every mobile-doc PIN mention**

Run:
```bash
grep -rniE 'encryption pin|encryption-pin|PIN gate|PinEntryGate|setPendingPIN|PIN-derived|PIN lock' docs/ | grep -viE 'mapping|pinned|spinning'
```
Expected: the lines listed above. Edit each so it reflects password-KEK / no-PIN behavior; delete rows/nodes that describe the removed feature.

- [ ] **Step 2: Sweep repo-root docs for stragglers**

Run from repo root:
```bash
grep -rniE 'encryption pin|encryption-pin|PIN-derived|PIN gate' ../../docs/ | grep -viE 'mapping|pinned|spinning'
```
Update any hit (e.g. security-architecture / data-flow) the same way. If none, note "no repo-root doc references".

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "docs(mobile): remove encryption PIN from architecture, diagrams, and audits"
```

---

### Task 5: Security review + full verification

Issue #152 carries the `security-review` label. Confirm the at-rest posture after removal and run the complete quality gate before wrapping up.

- [ ] **Step 1: Security review of the diff**

Use the `security-reviewer` agent (or `crypto-architecture` skill) against the branch diff. Confirm the review notes:
- The authoritative at-rest key is still the server blob wrapped with `deriveKey(password, userId, 200_000)` — **unchanged**.
- The local cache is now plaintext-in-`expo-secure-store` (OS/hardware keystore) in **all** authenticated cases — this was already the behavior for every non-PIN user; the only delta is the loss of the optional PIN wrap layer on compromised/rooted devices (accepted product decision).
- No new secret is hardcoded; no fallback/default added for any secret env var; the fail-fast secret pattern is preserved.
- Confirm the removed legacy `password + pin` server-blob migration branch is acceptable (pre-release; no legacy-format blobs expected in production).

- [ ] **Step 2: Full mobile quality gate**

Run: `npm run testAll`
Expected: PASS — `jest`, `tsc --noEmit`, `eslint`, and `expo-doctor` all green.

- [ ] **Step 3: End-to-end sanity in a running client (see Verification below)**

Confirm a logged-in user launches straight into the app (no PIN gate), can read existing encrypted messages, and that `Settings → Password & Security` no longer shows an "Encryption PIN" item.

- [ ] **Step 4: Finalize the branch**

Use superpowers:finishing-a-development-branch to open the PR (reference "Closes #152"). Ensure CI is green and the branch is up to date with the base branch before requesting review.

---

## Verification (end-to-end)

**Automated:**
- `npm test` — crypto suite green, PIN-management tests gone, no-PIN cached-path test present.
- `npm run typecheck && npm run lint` — no unused imports/vars; the Task 3 grep sweep returns empty.
- `npm run testAll` — full gate green.

**Manual (running client — use the `run` / Maestro tooling):**
1. **Fresh authenticated launch:** log in → app opens directly to the main UI, no PIN screen. (Previously a PIN user would have seen `PinEntryGate`.)
2. **Existing data readable:** open a conversation with previously-received messages → they decrypt and render (proves the no-PIN cached key / server re-fetch path works).
3. **Settings:** `Settings → Account → Password & Security` shows exactly three items — Change Password, Security Question, Generate Recovery Key — and **no** "Encryption PIN".
4. **Password change still works:** change the password and confirm messages still decrypt afterward (exercises the simplified `updateMasterKeyPassword`).
5. **Cold restart:** kill and relaunch the app while logged in → still opens directly and messages remain readable.

## Notes / Risk

- **Orphaned SecureStore keys:** on a dev/test device that had the PIN enabled, `pinEnabled` / `pinWrappedBundle` entries remain in secure storage but are never read again — harmless dead data (hard-removal, pre-release decision; no cleanup migration by design). If desired later, a one-line `deleteItemAsync` sweep can be added, but it is explicitly out of scope here.
- **No server change:** `/users/wrapped-key` and its password-only KEK are untouched; do not modify `server/`.
- **Legacy blob format:** removing the `password + pin` migration branch means any server blob still in the old password+pin format cannot be unwrapped. Acceptable under the pre-release assumption; call it out in the PR description.
