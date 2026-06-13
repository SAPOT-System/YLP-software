# feat(stress-test): auto-discover phone IP/port/userId via adb logcat

## Parent

[PRD — Align tcp-signaled to a real local-network test](../superpowers/plans/2026-06-13-local-network-test-alignment-prd.md)
· ADR [0002](../adr/0002-phone-discovery-via-adb-logcat.md)

## What to build

Replace the static `phoneIp` / `phonePort` / `phoneUserId` config fields with an adb-based
discovery step that reads them from the attached phone.

- A **pure parser** that takes `adb logcat` text and returns `{ ip, port, userId }`:
  - port from the existing `network › config constructed { port }` line (random per launch),
  - ip from the app's IP log / `NetInfo` line (fall back to `adb shell ip addr show wlan0`),
  - userId from the line added in [lnt-1](./lnt-1-app-userid-logcat-beacon.md).
- A small runner that invokes adb, feeds output to the parser, and returns the phone target.
- Wire the result into the orchestrator's star-mode setup so `lan.phoneIp/phonePort/phoneUserId`
  become optional/auto-filled.
- Clear, actionable errors when discovery fails: no adb device attached, a production build
  (userId line absent), or the expected log lines missing.

## Acceptance criteria

- [ ] Pure parser extracts ip, port, and userId from representative sample logcat strings
- [ ] Parser handles missing fields by reporting which field could not be found
- [ ] Runner returns a phone target without any manual `phoneIp/phonePort/phoneUserId` input
- [ ] Orchestrator star mode consumes the discovered target
- [ ] Distinct, actionable errors for: no device, production build, missing log line
- [ ] Unit tests cover parser success and each failure mode using synthetic log text
- [ ] `npm run build` and `npm test` pass

## Blocked by

[lnt-1 — expose userId in logcat](./lnt-1-app-userid-logcat-beacon.md) (the userId line must
exist for end-to-end discovery; the parser itself can be built/tested with sample logs first).
