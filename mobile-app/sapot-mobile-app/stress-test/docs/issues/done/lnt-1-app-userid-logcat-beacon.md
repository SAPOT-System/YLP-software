# feat(app): expose userId in logcat for dev/preview builds

## Parent

[PRD — Align tcp-signaled to a real local-network test](../superpowers/plans/2026-06-13-local-network-test-alignment-prd.md)
· ADR [0002](../adr/0002-phone-discovery-via-adb-logcat.md)

## What to build

The stress test's adb discovery needs the phone's userId, but the app logs it nowhere
(`user › set` logs only `{ isGuest, hasUser }`). Add the userId to a log line so it can be
scraped from `adb logcat` — but only in non-production builds.

- Emit the logged-in user's id on a stable, greppable log line at login / user-set time.
- Gate the line on build variant: present when `APP_VARIANT` is `development` or `preview`,
  absent in production. Reuse the existing `IS_DEV` / `IS_PREVIEW` mechanism from
  `app.config.ts`.
- Ensure the variant is readable at runtime (via `expoConfig.extra`) so the gate works
  on-device, not only at config-build time.

This is the only mobile-app change in the PRD; everything else lives in `stress-test/`.

## Acceptance criteria

- [ ] The phone's userId appears on a single, stable log line scrapeable by `adb logcat`
- [ ] The line is emitted in `development` and `preview` builds
- [ ] The line is absent in `production` builds (verified by test)
- [ ] The build variant is available at runtime through `expoConfig.extra`
- [ ] A unit test asserts presence for dev/preview and absence for production
- [ ] No userId is logged anywhere else that would reach a production build

## Blocked by

None.
