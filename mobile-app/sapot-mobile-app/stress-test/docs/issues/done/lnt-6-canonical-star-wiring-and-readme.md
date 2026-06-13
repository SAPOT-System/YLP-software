# feat(stress-test): wire the canonical star-vs-phone local-network test end-to-end

## Parent

[PRD — Align tcp-signaled to a real local-network test](../superpowers/plans/2026-06-13-local-network-test-alignment-prd.md)
· ADR [0001](../adr/0001-canonical-local-network-test-star-vs-phone.md)

## What to build

Tie the pieces together into a single runnable canonical local-network test and make it the
obvious choice in the docs.

- Orchestrator star mode: peers advertise via mDNS ([lnt-3](./lnt-3-peer-mdns-advertise.md))
  AND dial the phone target discovered via adb ([lnt-2](./lnt-2-adb-phone-discovery.md)),
  driving N concurrent sessions while discovery load runs.
- An example config for the canonical test that needs no hand-entered phone fields.
- README "Which test should I run?" updated so the canonical star-vs-phone test is THE
  local-network test; `tcp-signaled` loopback and `ws-signaled` rows reworded per their new
  labels (smoke test / server test).
- A short runbook for the manual, phone-attached run (attach via adb, launch a preview
  build, run the test).

## Acceptance criteria

- [ ] A single command runs the canonical test against an adb-attached phone with no manual
      phoneIp/phonePort/phoneUserId
- [ ] Peers both advertise (discovery) and dial the phone (sessions) within a phase
- [ ] Example config for the canonical test is committed
- [ ] README "Which test should I run?" names the canonical local-network test and corrects
      the `tcp-signaled` loopback and `ws-signaled` descriptions
- [ ] Runbook documents the adb + preview-build manual procedure
- [ ] `npm run build` and `npm test` pass

## Blocked by

[lnt-2 — adb phone discovery](./lnt-2-adb-phone-discovery.md) and
[lnt-3 — mDNS advertise](./lnt-3-peer-mdns-advertise.md). Benefits from
[lnt-5](./lnt-5-reporter-labels-and-discovery.md) for final report wording.
