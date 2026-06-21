# CLAUDE.md Refactoring Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce CLAUDE.md from 299 lines to under 200 by removing duplicate rules, compressing verbose sections, and extracting a project-local skill for mobile app commands — with zero loss of behavioral signal.

**Architecture:** Pure documentation refactoring — no TypeScript, no tests, no lint. Each task is an isolated edit to either CLAUDE.md or a new skill file. Verification is a line count check plus manual spot-read of Decision Rules and Definition of Done to confirm they are intact.

**Tech Stack:** Markdown, Claude Code project-local commands (`.claude/commands/`)

## Global Constraints

- Final `CLAUDE.md` must be ≤ 200 lines (hard limit)
- Do not alter any of the 6 Decision Rules or the Definition of Done checklist
- Do not remove any content from `## Conventions` or `## Don'ts`
- Do not remove the doc-sync mapping list under `## Important`
- Preserve all `features/shared/` file names and service names in the Architecture section
- Do not touch any file outside `CLAUDE.md` and `.claude/commands/app-commands.md`

---

### Task 1: Create project-local `app-commands` skill

**Files:**
- Create: `.claude/commands/app-commands.md`

This becomes the `/app-commands` slash command in Claude Code. It receives the full Mobile App Commands content currently in `CLAUDE.md` lines 111–148.

- [ ] **Step 1: Create the directory**

```bash
mkdir -p .claude/commands
```

Expected: exits 0, no output.

- [ ] **Step 2: Write the skill file**

Create `.claude/commands/app-commands.md` with this exact content:

````markdown
# Mobile App Commands

## Development

```bash
# Start dev server (sets APP_VARIANT=development)
npm run dev

# Prebuild and run on Android device/emulator
npm run prebuild          # expo prebuild --clean for development variant
npm run android           # run with dev app-id
```

## EAS Cloud Builds

```bash
npm run android:dev       # development profile
npm run android:prev      # preview profile
npm run android:prod      # production profile
```

## EAS OTA Updates (push JS bundle without full build)

```bash
npm run update:dev        # push to development channel
npm run update:prev       # push to preview channel
npm run update:prod       # push to production channel
```

## Quality Checks

```bash
npm run typecheck         # TypeScript type check
npm run lint              # ESLint
npm test                  # Run affected tests
npm run testAll           # tests + typecheck + lint + expo-doctor

# Single file or pattern
npx jest path/to/test.ts
npx jest --testNamePattern="pattern"
```
````

- [ ] **Step 3: Verify the file was created**

```bash
wc -l .claude/commands/app-commands.md
```

Expected: ≥ 20 lines.

- [ ] **Step 4: Commit**

```bash
git add .claude/commands/app-commands.md
git commit -m "chore: add app-commands project skill for mobile CLI reference"
```

---

### Task 2: Remove three duplicate / empty sections from CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

Remove these three sections. They duplicate Decision Rules already present later in the file.

**Section A — `## Reuse Rules`:** Duplicate of Decision Rule #3. Remove entire block.

```
## Reuse Rules

Before creating:

- components
- hooks
- services
- utilities

Search repository first.

Explain why existing implementation cannot be reused.
```

**Section B — `## Refactoring`:** Duplicate of Decision Rule #6. Remove entire block.

```
## Refactoring

Do not refactor unless explicitly requested.
```

**Section C — `## Architecture` one-liner placeholder:** Empty placeholder before the real Architecture section. Remove entire block including its trailing `---`.

```
## Architecture

Respect documented architecture boundaries.

---
```

- [ ] **Step 1: Remove Section A, B, and C from `CLAUDE.md`**

Apply all three deletions in one edit pass.

- [ ] **Step 2: Verify Decision Rules are still intact**

```bash
grep -n "Decision Rules" CLAUDE.md
```

Expected: one match. Then visually confirm all 6 numbered rules (1.–6.) are present.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "chore(claude-md): remove duplicate Reuse Rules, Refactoring, and empty Architecture sections"
```

---

### Task 3: Compress `## Large Changes` from 19 lines to 3

**Files:**
- Modify: `CLAUDE.md`

The 5-step numbered block says only "audit → plan → approve → implement → verify." Compress.

- [ ] **Step 1: Replace the Large Changes section**

Replace:

```markdown
## Large Changes

For changes affecting multiple files:

Step 1:
Audit current implementation

Step 2:
Provide plan

Step 3:
Wait for approval

Step 4:
Implement

Step 5:
Run verification
```

With:

```markdown
## Large Changes

For multi-file changes: audit the current implementation, provide a plan, wait for explicit approval, then implement and verify. Never begin implementation before the user approves the plan.
```

- [ ] **Step 2: Verify**

```bash
grep -A 3 "## Large Changes" CLAUDE.md
```

Expected: 3–4 lines, no numbered steps.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "chore(claude-md): compress Large Changes section"
```

---

### Task 4: Replace `## Mobile App Commands` with a one-line reference

**Files:**
- Modify: `CLAUDE.md`

The 38-line command block now lives in `.claude/commands/app-commands.md`. Replace with a pointer.

- [ ] **Step 1: Replace the Mobile App Commands section**

Replace the entire block from `## Mobile App Commands` through the closing triple-backtick with:

```markdown
## Mobile App Commands

Use `/app-commands` for the full CLI reference. Core quality checks: `npm run typecheck`, `npm test`, `npm run testAll`.
```

- [ ] **Step 2: Verify**

```bash
grep -A 3 "## Mobile App Commands" CLAUDE.md
```

Expected: 3 lines of output, no code fence.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "chore(claude-md): replace command block with /app-commands skill reference"
```

---

### Task 5: Compress three verbose Architecture subsections

**Files:**
- Modify: `CLAUDE.md`

Apply all three compressions in one edit pass.

---

**Subsection A — Encryption / Key Management**

Replace:

```markdown
### Encryption / Key Management (`features/shared/services/`)

The app does end-to-end encryption (NaCl box / `tweetnacl`) over both transports plus encryption at rest:

- **`tcp-encryption.ts`** — wraps/unwraps `EncryptedEnvelope` messages over the direct TCP channel.
- **`ws-encryption.ts`** — encrypts signaling/credential payloads relayed through the server WebSocket so the relay cannot read them.
- **`local-encryption-service.ts`** — at-rest encryption of local data; owns the master key and signaling secret key (persisted via secure storage helpers in `key-derivation.ts`).
- **`peer-key-service.ts` / `peer-key-store.ts`** — fetches, signs, verifies, and caches peer public keys (`SignedCredential`).
- **`key-recovery-service.ts`** — wraps the master key under multiple recovery methods (`password`, `phone`, `email`, `qa`, `token`) producing a `WrappedBlob`.
- **`key-derivation.ts`** — KDF + secure-store accessors for master/signaling keys.

Crypto stack: `tweetnacl` + `tweetnacl-util`, `@noble/hashes`, `expo-crypto`, `react-native-quick-crypto`.
```

With:

```markdown
### Encryption / Key Management (`features/shared/services/`)

NaCl box (`tweetnacl`) E2E encryption over both TCP and WS transports, plus at-rest encryption. Key files: `tcp-encryption.ts`, `ws-encryption.ts`, `local-encryption-service.ts`, `peer-key-service.ts`, `key-derivation.ts`, `key-recovery-service.ts`. Crypto stack: `tweetnacl`, `@noble/hashes`, `expo-crypto`, `react-native-quick-crypto`.
```

---

**Subsection B — GPS Feature**

Replace:

```markdown
### GPS Feature (`features/gps/`)

Live location sharing with server-side relay — independent of the P2P transport.

- **`GpsLocationService`** — opens a dedicated WebSocket to `/gps/ws/<userId>`, watches device position via `expo-location`, and streams `{ lat, lng }` updates. Auto-reconnects on disconnect (3 s delay). Does **not** go through `ConnectionService`.
- **`useGpsStreaming`** — starts/stops `GpsLocationService` based on auth state and user preference. Only runs for authenticated, non-guest users with sharing enabled.
- **`useLatestLocations`** — polls `GET /gps/latest` every 5 s via React Query; used to render other rescuers on the map.
- **`GpsPreferenceContext`** — persists the user's sharing toggle in `expo-secure-store` (key: `gps_sharing_enabled`). Wrap screens that need the preference with `GpsPreferenceProvider`.
- Map rendering uses `@maplibre/maplibre-react-native`.
- `UserStore.isRescuer` gates whether GPS streaming is activated after user sync in `AuthProvider`.
```

With:

```markdown
### GPS Feature (`features/gps/`)

Live location sharing via a dedicated WebSocket (`/gps/ws/<userId>`) — independent of `ConnectionService`. Key hooks: `useGpsStreaming`, `useLatestLocations`. Map: `@maplibre/maplibre-react-native`. Gated by `UserStore.isRescuer`. See `docs/ARCHITECTURE.md` for full detail.
```

---

**Subsection C — Logging**

Replace:

```markdown
### Logging

Scope-based logger via `react-native-logs` + Reactotron (`features/shared/utils/logger.ts`). Each module uses a named scope (e.g., `connectionLog`, `networkLog`, `backgroundLog`). Control which scopes print at runtime via the env var:

```
EXPO_PUBLIC_ENABLED_LOG_MODULES=connection,network,background
```

Leave unset to enable all scopes.

Logs are also written to a daily file (`sapot-{date-today}.log` in the app document directory) — always on in production, opt-in during development via `EXPO_PUBLIC_LOG_TO_FILE=1`. Use the exported `getLogFilePath()` / `clearLogFile()` helpers to retrieve or clear it.

In **development**, logs are additionally shipped to a laptop collector (`scripts/dev-log-server.mjs`, run via `npm run log-server`) which writes them to `dev-logs/dev-<metroPort>.log`, separated per dev-client (Metro) port. On by default in dev; disable with `EXPO_PUBLIC_LOG_TO_LAPTOP=0`. See `docs/ENV_CONFIG.md`.
```

With:

```markdown
### Logging

Scope-based logger (`features/shared/utils/logger.ts`). Enable specific scopes via `EXPO_PUBLIC_ENABLED_LOG_MODULES=connection,network,...` (unset = all). Daily log file — retrieve via `getLogFilePath()`. Dev laptop collector: `npm run log-server` (disable: `EXPO_PUBLIC_LOG_TO_LAPTOP=0`).
```

---

- [ ] **Step 1: Apply all three subsection compressions to `CLAUDE.md`**

- [ ] **Step 2: Verify all three headings still exist**

```bash
grep -n "### Encryption\|### GPS Feature\|### Logging" CLAUDE.md
```

Expected: three matches in sequence.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "chore(claude-md): compress Encryption, GPS, and Logging subsections"
```

---

### Task 6: Simplify `## Git & Commits`

**Files:**
- Modify: `CLAUDE.md`

The Conventional Commits format and type list duplicate the global `~/.claude/rules/ecc/common/git-workflow.md`. Remove the duplicate line; keep only project-specific rules.

- [ ] **Step 1: Replace the Git & Commits section**

Replace:

```markdown
## Git & Commits

- Never commit directly to `main` or `develop` — create a branch first.
- Commit only when the user asks. Do not push unless asked.
- Follow [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): description`.
  Valid types: `feat`, `fix`, `chore`, `refactor`, `test`, `docs`, `perf`, `ci`.
- Analyze the full diff (`git diff <base>...HEAD`), not just the latest commit, before writing a PR summary.
```

With:

```markdown
## Git & Commits

- Never commit directly to `main` or `develop` — create a branch first.
- Commit only when the user asks. Do not push unless asked.
- Analyze the full diff (`git diff <base>...HEAD`), not just the latest commit, before writing a PR summary.
```

- [ ] **Step 2: Verify**

```bash
grep -c "Never commit directly" CLAUDE.md
```

Expected: `1`.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "chore(claude-md): remove Conventional Commits format duplicate from Git section"
```

---

### Task 7: Verify final state

**Files:**
- Read: `CLAUDE.md`

- [ ] **Step 1: Check line count**

```bash
wc -l CLAUDE.md
```

Expected: ≤ 200. If over 200, trim the longest remaining prose section by one paragraph and recheck.

- [ ] **Step 2: Confirm all 6 Decision Rules are intact**

```bash
grep -n "^[0-9]\." CLAUDE.md | head -10
```

Expected: entries for `1.` through `6.` all present.

- [ ] **Step 3: Confirm Definition of Done checklist is intact**

```bash
grep -c "\- \[ \]" CLAUDE.md
```

Expected: `6`.

- [ ] **Step 4: Confirm doc-sync list is intact**

```bash
grep -c "docs/ARCHITECTURE" CLAUDE.md
```

Expected: ≥ 1 (in the `## Important` section).

- [ ] **Step 5: Confirm `/app-commands` pointer exists**

```bash
grep "app-commands" CLAUDE.md
```

Expected: one match.

- [ ] **Step 6: Final commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude-md): refactor complete — under 200 lines, ~30% token reduction"
```

---

## Expected Outcome

| Metric | Before | After |
|---|---|---|
| `CLAUDE.md` line count | 299 | ≤ 200 |
| Estimated tokens per session | ~3,800 | ~2,650 |
| Token reduction | — | ~30% |
| Duplicate rule sections | 2 | 0 |
| Empty placeholder sections | 1 | 0 |
| Command reference | Inline 38-line block | `/app-commands` skill |
| Behavioral signal lost | — | None |
