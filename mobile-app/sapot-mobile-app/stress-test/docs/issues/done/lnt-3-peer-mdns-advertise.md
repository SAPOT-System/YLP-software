# feat(stress-test): advertise canonical peer over mDNS so the phone discovers it

## Parent

[PRD — Align tcp-signaled to a real local-network test](../superpowers/plans/2026-06-13-local-network-test-alignment-prd.md)
· ADR [0001](../adr/0001-canonical-local-network-test-star-vs-phone.md)

## What to build

The canonical signaled peer must be discoverable by the phone exactly as a real device is.
Bring the mDNS advertisement mechanism that already exists in `LanPeer` into the
tcp-signaled (star) peer.

- Advertise an `_lanchat._tcp` service per simulated peer, with the same identity TXT
  records the app expects (id / username / peerId etc., matching `LanPeer.advertiseMdns`).
- Advertise on the same WiFi interface/IP the peer's TCP server listens on, so the phone
  can both discover and reach it.
- Tear the advertisement down cleanly on `disconnect()` (mirror `LanPeer`'s end-with-timeout).
- Keep mDNS non-fatal in CI/test environments where it is unavailable (best-effort), as
  `LanPeer` already does.

## Acceptance criteria

- [ ] Each canonical peer advertises a discoverable `_lanchat._tcp` service while running
- [ ] TXT records match what the app's discovery expects (parity with `LanPeer`)
- [ ] Advertisement is bound to the peer's LAN IP/port
- [ ] `disconnect()` stops advertising within a bounded timeout
- [ ] mDNS failure in CI is non-fatal (test still passes without a responder)
- [ ] Unit/integration test verifies advertise + teardown behaviour
- [ ] `npm run build` and `npm test` pass

## Blocked by

None.
