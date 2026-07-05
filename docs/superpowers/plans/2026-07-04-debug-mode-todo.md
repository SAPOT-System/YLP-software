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
- [x] **1. DebugPanel shell** (Medium, 1.5d, deps: 0) — bottom-sheet/modal mounted once at root;
      FAB + 5-tap-in-About + shake openers; header (variant/version/peerId/transport/online).
      **Done:** new `features/debug/` — `debug-panel-store.ts` (subscribe/emit, mirrors
      `UserStore`/`AppModeStore`), `use-debug-panel.ts`, `DebugPanel` (react-native-paper
      `Portal`+`Modal`, header shows variant/version/peerId/mode/online via `useAppMode`,
      `useServerStatus`, `useUserStore`; 16-section list with in-modal placeholder navigation;
      quick-action buttons rendered disabled — real wiring lands with their owning deliverables),
      `DebugFab` (draggable via `PanResponder`, primary opener). Mounted in
      `app/(drawer)/_layout.tsx` (inside `MainContainerProvider`/`HealthProvider`, not the true
      app root, since the panel's hooks require that context — matches where the existing
      `debug.tsx` tab already lives). 5-tap-on-version opener added to
      `app/(drawer)/settings/support/about-us.tsx` (this screen previously had no version
      display at all). **Deferred to a later pass:** shake gesture and emulator dev-menu
      shortcut — both need a new dependency (`expo-sensors`) or native dev-menu wiring,
      out of scope for the shell per explicit user decision.
      Full suite green: `tsc --noEmit`, `eslint .`, `jest` (108 suites / 853 tests).
- [x] **2. DebugDbService** (Medium, 2d, deps: 1) — table browser/seeder, absorb `useDatabase`
      (`unsafeResetDatabase` etc.), export/import JSON.
      **Done:** `features/debug/services/debug-db-service.ts` — `DebugDbService` wraps the shared
      `database` (schema-driven `listTableNames`, `getTableSummaries`/`getRows` via
      `.query().fetch()`, `deleteRow`/`resetDatabase` via `database.write`+`batch` matching the
      existing repository pattern, `seedPeers`, and JSON `exportToJson`/`importFromJson` using
      WatermelonDB's `_raw` escape hatch — same pattern `use-database.ts` already used for
      `peer._raw.id`). `use-debug-db.ts` hook drives new `DatabaseSection` component, wired into
      `DebugPanel` in place of the placeholder for the "database" key; "Reset DB" quick action now
      calls `debugDbService.resetDatabase()` (other quick actions remain disabled pending their own
      deliverables).
      **Follow-up (same session):** `features/shared/hooks/use-database.ts` and its only consumer,
      the legacy `app/(drawer)/(tabs)/debug.tsx` tab screen, are now fully removed — per explicit
      user instruction, `debug.tsx` was deleted outright (not migrated to `debugDbService`) since
      the gated `DebugPanel` → `DatabaseSection` supersedes it. Also removed: the `debug` tab
      registration in `app/(drawer)/(tabs)/_layout.tsx` (+ the `TabBarIcon`/`FontAwesome` helper
      that only that tab used), the `useDatabase` barrel export in
      `features/shared/hooks/index.ts`, and the screen's two tests
      (`debug-{enabled,disabled}.test.tsx`).
      **Follow-up 2 (same session):** row data is now rendered as a real table
      (`react-native-paper` `DataTable`) instead of `JSON.stringify`'d `List.Item` rows, and only
      schema-defined columns are shown (new `DebugDbService.getTableColumns()`, backed by
      `database.schema.tables[name].columns`) — internal WatermelonDB bookkeeping fields
      (`_status`, `_changed`) are no longer displayed. `id` is kept as its own leading column since
      it's needed to identify/delete a row, even though it isn't a schema column. Per-row delete
      moved from "tap the row" to a dedicated delete icon-button cell.
      **Follow-up 3 (same session):** fixed header/cell misalignment in the `DataTable` (each
      column's `Title`/`Cell` now shares a fixed `width` + `flex: 0` from a `StyleSheet`, so header
      and body cells no longer drift apart based on differing content length) and added
      pagination for performance — `getRows(tableName, { limit, offset })` (`Q.skip`/`Q.take`) so
      the browser no longer fetches an entire table at once; `getTableSummaries()` now uses
      `fetchCount()` instead of fetching every row just to count them; `deleteRow` now queries by
      `Q.where("id", id)` instead of fetching the whole table to find one row. `useDebugDb` pages
      in 25 rows at a time (`hasMore` + `loadMoreRows()`), with a "Load more" button in
      `DatabaseSection`; `deleteRow` now updates `rows` locally instead of refetching.
      `exportToJson`/`importFromJson` are unaffected — export intentionally still fetches every
      row per table (it's a full-DB dump, not a browse operation).
      **Follow-up 4 (same session):** cell values past a per-column character threshold
      (`ID_CELL_MAX_CHARS`=20, `DATA_CELL_MAX_CHARS`=18 in `database-section.tsx`) are now
      truncated with a literal `truncateCellValue()` helper (slice + `"..."`) rather than relying
      on RN `Text` `numberOfLines`/layout-based ellipsis — per explicit user preference.
      **Follow-up 5 (same session):** removed the "Export JSON" button + inline JSON dump from
      `DatabaseSection` per explicit user instruction (along with the now-unused `useTheme` import
      and `useState`). `DebugDbService.exportToJson`/`importFromJson` are untouched — still
      tested, still part of the deliverable-2 spec — they're just not wired to a UI affordance
      right now (same as `importFromJson`, which never had one either).
      Full suite green: `tsc --noEmit`, `eslint features/debug`, `jest` (110 suites / 895 tests).
- [x] **3. Auth/User section** (Medium, 2d, deps: 1,2) — seed test users, role/mode switch, JWT
      inject/clear, force logout/reset.
      **Done:** `features/debug/services/debug-auth-service.ts` — `DebugAuthService` over live
      per-`AuthContainer` instances (`UserService`, `UserStore`; not module singletons like
      `debugDbService`, so it's constructed in the hook rather than imported bare):
      `seedTestUser(role)` reuses `UserService.syncAuthenticatedUser` to create a fixture peer
      (`debug_<role>_<suffix>`) then sets the role flags; `setRole(role)` switches
      `UserStore.isRescuer`/`isAdmin` on the current user without reseeding; `forceLogout` →
      `UserService.logout()`; `resetAuthState` → `UserService.wipeDatabase()` (existing
      pre-relogin reset path, doesn't stop connection services); `getSnapshot()` reports
      current user id/username/isGuest/isRescuer/isAdmin/hasAccessToken. Added
      `saveAccessToken`/`clearAccessToken` to `features/shared/core/stores/secure-config.ts`
      (only a reader existed before) for JWT inject/clear — `injectFakeAccessToken()` writes a
      `debug.<uuid>.token` placeholder, never a real credential. `use-debug-auth.ts` hook wraps
      the service (obtained via `useUserService()`/`useUserStore()`, memoized with `useMemo`) in
      the same load/refresh-snapshot pattern as `use-debug-db.ts`. New `AuthSection` component
      wired into `DebugPanel` for **both** the `auth` and `users` `DEBUG_SECTIONS` keys (one
      component covers "Auth" + "User management" per the spec's single roadmap line) —
      `debug-panel.tsx`'s placeholder branch gained an `auth`/`users` case. "Mode switch" (from
      the roadmap title) is **not** included — that's `AppModeStore`/transport mode, which
      belongs to deliverable 4 (Offline/Network); this deliverable only covers role switch.
      "User management ... via DebugDbService" (peers.role/is_online row editing) is also
      deferred — the existing table browser (deliverable 2) only supports view/delete, not
      edit, and adding row-level editing was judged out of scope for this ticket.
      **Follow-up (same session):** `seedTestUser` now calls `UserService.wipeDatabase()`
      before creating the new fixture user, so the previous user's local data (peers, messages,
      conversations) is wiped rather than left behind alongside the new one; it also still
      restarts the app afterward (prior fix) so every in-memory service re-initializes clean.
      Fixed `forceLogout`/`resetAuthState` appearing to do nothing: `UserService.logout()`/
      `wipeDatabase()` only reset `isRescuer` and the session/userUUID keys, never `isAdmin` or
      the injected JWT, so the Auth section kept showing the old identity/token after either
      action — both `DebugAuthService` methods now also call `userStore.setIsAdmin(false)` and
      clear the stored access token. Added visible feedback for every action per user request:
      `AuthSection` now uses the existing `useToast`/`AppSnackbar` pattern (already used in
      `custom-drawer-content.tsx`) to show a success/error snackbar after each button press, and
      Force logout / Reset auth state now go through an `Alert.alert` confirm step first
      (mirroring `DatabaseSection`'s destructive-action pattern) before running.
      **Follow-up 2 (same session):** `forceLogout`/`resetAuthState` now restart the app after
      running (same `use-debug-auth.ts` `restartApp()` helper `seedTestUser` already used),
      and their underlying `DebugAuthService` behavior was rewritten to match the real
      `AuthProvider` bootstrap flow (`features/auth/context/auth-context.tsx`) instead of
      hand-patching in-memory state: `forceLogout` now mirrors production `AuthContext.logout`
      — deletes `refresh_token` (new, via `expo-secure-store`, matching the existing raw-key
      convention `user-service.ts`/`auth-context.tsx` already use for this key) and calls
      `clearConnectionConfig()` (also clears `userUUID`/`access_token`) on top of
      `UserService.logout()`, so a restart finds no local session and lands on the login
      screen. `resetAuthState` was simplified to *only* `clearAccessToken()` — no more
      `wipeDatabase()`/manual `isAdmin` patch — so a restart's bootstrap finds the existing
      local user record, stays signed in, and silently re-authenticates via the still-present
      `refresh_token` (`AuthProvider`'s `refreshSession()`), never showing the login screen.
      **Follow-up 3 (same session):** added `DebugAuthService.seedLanUser()` — same
      wipe-then-restart pattern as `seedTestUser`, but calls `UserService.syncGuestUser()`
      (the same identity path as the real "LAN Login" guest flow) instead of
      `syncAuthenticatedUser`, using the existing `generateGuestUsername` util
      (`features/auth/utils/guest-username-generator.ts`) rather than hand-rolling a username.
      Guests never get role flags, so it skips `setIsRescuer`/`setIsAdmin`. `AuthSection`'s
      "Seed user" button (the role-less `seedTestUser("user")` variant) is relabeled
      "Seed auth user" to disambiguate it from the new "Seed LAN user" button.
      **Follow-up 4 (same session):** `seedTestUser` now registers a *real* account through the
      server's `/auth/` endpoint (`register` from `features/auth/api/auth.api.ts` — the same API
      the sign-up screen uses, aliased `register as registerApi` matching the existing
      `auth-context.tsx` import convention) instead of fabricating a local-only peer row; the
      response's genuine `access_token`/`refresh_token` are stored (`saveAccessToken` +
      raw `setItemAsync("refresh_token", …)`, matching the `use-register.ts` pattern), then the
      returned server user is synced locally via `syncAuthenticatedUser` before `setRole` applies
      the debug-only role override (registration itself has no role field). Password is generated
      to satisfy the real backend's complexity rule (`features/auth/utils/validation.ts`:
      8–128 chars, upper+lower+digit). `seedLanUser` now also deletes `refresh_token` and clears
      the access token before creating the guest (guests never hold a session, so any leftover
      tokens from a previously seeded auth user are dropped), and its first name is now picked
      randomly from a fixed name pool instead of the hardcoded "Debug", so repeated LAN seeds
      don't all look identical.
      **Follow-up 5 (same session):** fixed a real bootstrap bug in
      `features/auth/context/auth-context.tsx` (not `features/debug/`) that "Seed LAN user"
      exposed: `UserService.syncGuestUser()` writes `userUUID` too (so the background task can
      find it), so on the post-seed restart, `AuthProvider`'s bootstrap `useEffect` saw a
      truthy `userUUID` and took the *authenticated*-user branch — `initialize({isGuest:false})`
      — instead of the guest-restore branch, which only ran in the `else` when `userUUID` was
      absent. That branch looks up the id in the `peers` table (empty for a guest), fails,
      finds no `refresh_token` (guests never have one, and `seedLanUser` explicitly clears it),
      and gives up — leaving `isAuthenticated=false`/`isGuest=false`, which routes to the
      getting-started screen instead of the guest chat UI (confirmed via user-supplied logs:
      `initialize complete {isGuest:false, hasUser:false}` → `no local record, attempting
      server refresh` → `missing refresh token`). Fix: bootstrap now checks
      `userService.isCurrentUserGuest()` (a `guest_user` table lookup, independent of the
      `userUUID` key) *before* the `userUUID` branch, since guest status is the more specific
      signal. This is a real production fix, not debug-only — it also corrects the same failure
      for any real guest ("LAN Login") user whose app was ever restarted. Added a regression
      test in `features/auth/context/__tests__/auth-context.test.tsx`.
      Full suite green: `tsc --noEmit`, `eslint .`, `jest` (114 suites / 951 tests).
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
