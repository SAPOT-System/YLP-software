# 5. Phone-side session log contract for failure attribution

Date: 2026-06-18

## Status

Accepted

## Context

The session ceiling (ADR-0004) is declared from ICE-connected success rate measured on the
**laptop** side. A laptop-side timeout is ambiguous: the phone may have refused/been
overwhelmed, the offer may never have reached the phone, or the laptop may have failed to
emit it. Only the first is a real phone ceiling, so a timeout-heavy phase cannot, on its
own, prove the **phone** hit its limit — which is exactly the claim the tool makes.

ADR-0002 already established an `adb logcat` scraping path and a precedent for emitting
test-only beacons gated by `APP_VARIANT`. We extend that path rather than add a new channel.

## Decision

The phone **logs session lifecycle events** — session accepted, session rejected, and the
current active-session count — which the orchestrator scrapes via the existing logcat path
to corroborate the laptop-side ceiling and classify each failure as phone-refused vs
never-arrived.

These log lines are present when `APP_VARIANT` is **development or preview** (both
internal-distribution builds) and stripped in production, mirroring the userId beacon gate
from ADR-0002. The preview APK sideloaded for stress testing therefore surfaces them while
production stays clean.

## Consequences

- A ceiling result can be attributed to the phone: failures are classified rather than
  lumped into one ambiguous timeout bucket.
- The app's session-logging lines join the existing logcat contract (ADR-0002) that preview
  and development builds must preserve; silencing or reformatting them breaks attribution.
- Session-level activity (counts, accept/reject) is emitted to logcat in development and
  preview builds. Acceptable for internal builds; the `APP_VARIANT` gate keeps it out of
  production.

## Alternatives considered

- **Laptop-side only** — rejected: failures stay unattributable, weakening the core claim.
- **Phone resource attestation (dumpsys CPU/mem)** — rejected as the primary signal: shows
  the phone was stressed but not whether it accepted or refused specific sessions; may be
  added later as a complementary signal.
