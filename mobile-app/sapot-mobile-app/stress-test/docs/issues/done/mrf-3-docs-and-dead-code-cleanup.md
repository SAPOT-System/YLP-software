# chore(stress-test): document active-users assumption, fix payload doc, drop dead mode labels

## Parent

[PRD — Stress-test modes: truthful connectivity metric + review fixes](../superpowers/plans/2026-06-13-modes-review-fixes-prd.md)

## What to build

Three small documentation/cleanup items left over from the modes review. No behavior
change.

- **Document the active-users assumption.** `getVisiblePeerIds` resolves on the first
  JSON array it receives. This is correct: the server answers `get-active-users` with
  a **bare JSON array** of userId strings (no `type` wrapper), and no other
  server→peer frame on this socket is array-shaped. Add a code comment recording this
  (cite the server handler) and noting the colocation loop tolerates a rare stale
  cross-round response by retrying. Do **not** add correlation machinery — the
  protocol is a bare array we do not control.
- **Fix the audio RTP payload doc.** `CLAUDE.md` (and `README.md` where applicable)
  describe the audio payload as "3-byte"; the code produces a 32-byte payload (44-byte
  packet). Update the docs to match.
- **Remove dead mode-label branches.** `getModeLabel` still branches on the removed
  `ws`, `lan`, `both`, and `webrtc` modes. Delete those branches, keeping only
  `ws-signaled` and `tcp-signaled`.

## Acceptance criteria

- [ ] `getVisiblePeerIds` has a comment explaining why "first array" is a correct
      discriminator (citing the server's bare-array `get-active-users` response) and
      that the colocation loop tolerates a rare stale response
- [ ] `CLAUDE.md` and `README.md` describe the audio RTP payload as 32 bytes / 44-byte
      packet
- [ ] `getModeLabel` no longer references `ws`, `lan`, `both`, or `webrtc`
- [ ] No behavior change; existing reporter tests still pass (extend if a label
      assertion is affected)
- [ ] `npm run build` and `npm test` pass

## Blocked by

[mrf-1 — measure peer connectivity at phase end](./mrf-1-truthful-connectivity-metric.md)
(re-touches the reporter and the ws-signaled peer files mrf-1 edits; sequenced to avoid
merge conflicts — no logical dependency).
