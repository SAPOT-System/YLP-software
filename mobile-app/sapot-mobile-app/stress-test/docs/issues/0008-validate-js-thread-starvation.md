# 0008 — Validate JS-thread starvation hypothesis

Labels: `ready-for-agent`
PRD: PRD-tcp-star-accuracy.md
Type: HITL
Depends on: none (do first)

## What to build

Run the 20-peer tcp-signaled star test with the connection timeout raised to 20 s. Compare
the result against the baseline 10 s run. If the connected-peer count rises, the hypothesis
is confirmed: WatermelonDB `db.write()` calls on the phone's `peer-identity` hot path are
blocking the JS event loop long enough to starve ICE callbacks before the 10 s timeout
fires.

Document the finding (pass or fail) in a short comment on this issue before closing it. The
phone-side fix (`void`-ing the `updatePeerInfo` call on the hot path) is tracked outside
this repo and is unblocked once confirmation is in hand.

## Acceptance criteria

- [ ] `verify-stress-test.config.json` updated with `connectionTimeoutMs: 20000` for the
  duration of this experiment.
- [ ] 20-peer star test executed and result JSON saved to `stress-results/`.
- [ ] Finding documented: did connected-peer count rise above 3/20 at 20 s?
- [ ] `verify-stress-test.config.json` restored to its previous timeout after the run.

## Blocked by

None — can start immediately.
