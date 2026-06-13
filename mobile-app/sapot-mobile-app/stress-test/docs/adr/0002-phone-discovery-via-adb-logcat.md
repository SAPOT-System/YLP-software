# 2. Phone IP / port / userId discovered via adb logcat scraping

Date: 2026-06-13

## Status

Accepted

## Context

The canonical local-network test (see
[0001](./0001-canonical-local-network-test-star-vs-phone.md)) requires three facts about
the phone before simulated peers can engage it:

- **WiFi IP** — to dial the phone's TCP signaling server.
- **TCP listen port** — same.
- **userId** — the phone's signaling routing drops any message whose `data.to` does not
  equal the logged-in user's id, so peers must address the real user.

These were previously hand-entered as static config (`phoneIp`, `phonePort`,
`phoneUserId`), which is error-prone and goes stale every app launch:

- The app's TCP **port is randomly generated each launch** (49152–65535,
  `network-config.ts`), so there is no fixed port to target.
- The phone is already attached over USB/adb for the existing phone test modes.

Observability of each fact from the laptop:

- IP and port are already written to the app's logs at startup
  (`network › config constructed { port }`, plus IP logs / `NetInfo`).
- The userId is **not** logged anywhere — `user › set` logs only `{ isGuest, hasUser }`.

## Decision

Auto-discover the phone via **`adb logcat` scraping**. The orchestrator parses the device
log for the WiFi IP, TCP port, and userId, replacing the static `phoneIp` / `phonePort` /
`phoneUserId` config fields.

Because the userId is not currently logged, the app will **emit the userId to a log line**,
gated to non-production builds via the existing `APP_VARIANT` mechanism — the line is
present when `APP_VARIANT` is `development` or `preview` (both `distribution: internal`
EAS profiles) and stripped in production. The preview APK — the build actually sideloaded
for stress testing — therefore surfaces the userId, while production stays clean. This
requires the variant to be readable at runtime via `expoConfig.extra`.

## Consequences

- Test setup drops three manual fields; the operator only attaches the phone via adb and
  runs the test.
- The test is coupled to the app's **log format and log levels**. If the
  `network › config constructed` line or the userId beacon line changes or is silenced,
  discovery breaks. Both lines become a (lightweight) contract the app must preserve for
  preview builds.
- A user identifier (UUID) is emitted to logcat in development and preview builds. This is
  acceptable for internal-distribution test builds but must never reach production — the
  `APP_VARIANT` gate enforces this.
- Discovery cannot run against a production build (userId absent by design); stress testing
  requires a `preview` (or `development`) build.

## Alternatives considered

- **Dedicated logcat beacon** (one structured `{ip,port,userId}` line under a fixed tag) —
  more robust to parse, but a larger app change than reusing existing log lines plus one
  userId addition.
- **Pinned port via test/env override** — deterministic, but threads an override path into
  the app's port generation and still needs the account up front.
- **Manual `phoneUserId` only** (auto IP/port, hand-entered userId) — less app footprint,
  but keeps a stale-prone manual step the operator must look up each session.
- **Server auth + JWT decode for userId** — no app change, reuses `fetchJwt`/`decodeToken`,
  but requires the phone account's credentials as a test input; rejected in favour of
  keeping discovery sourced entirely from the attached device.
