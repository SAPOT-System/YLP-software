# Mobile Debug Mode — Implementation Todo

**Spec:** `~/.claude/projects/-home-adamskieee-Documents-dev-YLP-software/specs/2026-07-04-mobile-developer-debug-mode-design.md`
**Worktree:** `.worktrees/mobile-debug-mode` (branch `feature/mobile-debug-mode`, based on `develop`)
**Component:** `mobile-app/sapot-mobile-app`

Each deliverable below is scoped to land as its own PR (branched off `feature/mobile-debug-mode` or directly, per spec §8 "Recommended first PR"). Follow this repo's TDD + code-review workflow per deliverable; don't batch multiple deliverables into one diff.

## Deliverables (spec §8 roadmap)

- [x] **0. Security gate** (Low, 0.5d, no deps) — `config/debug.ts` gate
      (`IS_DEBUG_ENABLED = __DEV__ || EXPO_PUBLIC_DEBUG_MENU === "1"`); exclude
      `app/(drawer)/(tabs)/debug.tsx` from prod; add CI boundary check.
      **Ship this first, standalone** — closes the production-exposure risk (spec §7 CRITICAL)
      regardless of when the rest lands.
      **Done:** `config/debug.ts` added; `debug.tsx` now `<Redirect>`s to the home tab when
      `IS_DEBUG_ENABLED` is false (deep-link/`router.push` can no longer reach it, closing the
      gap the tab-bar `href: null` alone didn't cover); "CI boundary check" implemented as unit
      tests (`config/__tests__/debug.test.ts`,
      `app/(drawer)/(tabs)/__tests__/debug-{enabled,disabled}.test.tsx`) that already run in the
      existing `expo-android-ci.yml` unit-test step — did not add a new CI workflow step since
      that requires editing `.github/workflows/*.yml`, which root CLAUDE.md reserves for an
      explicit ask. `EXPO_PUBLIC_DEBUG_MENU` documented in `docs/ENV_CONFIG.md` + `.env.example`.
      Full suite green: `tsc --noEmit`, `eslint .`, `jest` (100 suites / 833 tests).
- [ ] **1. DebugPanel shell** (Medium, 1.5d, deps: 0) — bottom-sheet/modal mounted once at root;
      FAB + 5-tap-in-About + shake openers; header (variant/version/peerId/transport/online).
- [ ] **2. DebugDbService** (Medium, 2d, deps: 1) — table browser/seeder, absorb `useDatabase`
      (`unsafeResetDatabase` etc.), export/import JSON.
- [ ] **3. Auth/User section** (Medium, 2d, deps: 1,2) — seed test users, role/mode switch, JWT
      inject/clear, force logout/reset.
- [ ] **4. FaultInjector + Offline/Network sections** (High, 3d, deps: 1) — no-internet,
      LAN/server/Redis/auth/sync-down toggles; adapter-level latency/loss/dup/corruption.
- [ ] **5. MockPeerTransport + Messaging/Peers sim** (High, 3d, deps: 1,4).
- [ ] **6. WebRTC scenario runner** (High, 3d, deps: 4,5).
- [ ] **7. DebugLocationProvider GPS section** (Medium, 2d, deps: 1).
- [ ] **8. In-app LogConsole + ring-buffer transport** (Medium, 1.5d, deps: 1).
- [ ] **9. FeatureFlagStore + section** (Low, 1d, deps: 1).
- [ ] **10. Sync / Notifications / Error / Perf sections** (Medium, 3d, deps: 1,4).
- [ ] **11. Maestro flows + DebugBridge launch args** (Medium, 2d, deps: 2,3,4).
- [ ] **12. Host auto-discovery + fix duplicate schema column migration** (Low, 1d, no deps) —
      independent, can land any time.

## Cross-cutting risk (spec §8)

Deliverables 4–6 touch the highest-blast-radius directories (`features/shared/connection/`,
`features/shared/crypto/`) — per mobile CLAUDE.md Decision Rule 4, audit all consumers first.
Mitigation: adapter-boundary middleware that is a strict no-op unless `IS_DEBUG_ENABLED`; keep
all new code under `features/debug/`.

## Notes

- All new building blocks live under gated `features/debug/` (spec §8 "New building blocks").
- Update `docs/ARCHITECTURE.md`, `docs/ENV_CONFIG.md`, `docs/TESTING.md` as each deliverable
  lands, per this component's CLAUDE.md doc-sync requirements.
- Run `pnpm run typecheck && pnpm test && pnpm run lint` (or `testAll`) before marking any
  deliverable done.
