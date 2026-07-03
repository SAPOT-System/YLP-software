# GitHub Issue Drafts (confirmed observations only)

> Drafts for confirmed (✅) and confirmed-behaviour change-requests (🔵). Partially-confirmed (🟡)
> items are listed at the bottom as "needs repro before filing" and intentionally have no draft.
> Nothing has been filed on GitHub yet.

---

## [BUG] Incoming messages lose their original send time (ordering + wrong dates)
**Labels:** bug, chat, high
**Severity:** High

**Summary.** Received messages are stored with `createdAt = new Date()` (local receive/persist time)
instead of the sender's `sentAt`, and the chat list orders by `created_at`. This causes both
out-of-order messages (obs #4) and wrong day/date labels (obs #18).

**Evidence.**
- Sender transmits `sentAt`: `chat-message-service.ts:565` (`sentAt: newMessage.createdAt`) and `:485`.
- Receiver ignores it: `chat-receive-service.ts:242-258` calls `prepareMessageCreate` without `sentAt`.
- `message-repository.ts:237,262` always sets `message.createdAt = new Date()`.
- Ordering: `message-repository.ts:285` / `message-list.tsx:38` sort on `created_at`.
- Server also stamps its own time: `server/app/models/message.py` `created_at = now_ms()` via `default_factory`.

**Failure scenario.** Peer A (offline) sends "Hello" Monday; it is delivered Wednesday when A reconnects.
On B's device the message shows Wednesday's date and sorts after messages B genuinely received Tuesday.

**Fix.** Thread `sentAt` through `prepareMessageCreate`/`saveIncomingMessage` and set
`message.createdAt = new Date(data.sentAt)`. Keep a separate `receivedAt` if needed. Persist the
sender timestamp server-side on sync instead of overwriting with `now_ms()`.

---

## [BUG] Chat only shows the oldest 100 messages; newer messages disappear
**Labels:** bug, chat, high
**Severity:** High

**Summary.** The message list query is `sortBy(created_at, asc) + take(100)`, i.e. the **oldest** 100
messages, with no pagination. Once a conversation exceeds 100 messages, newly sent/received messages
fall outside the window and are never displayed (obs #17).

**Evidence.** `features/chat/components/message-list.tsx:34-42`.

**Failure scenario.** A busy conversation reaches 100 messages; message #101 onward never appears in the
thread even though it is in the DB and shows in the chat-list preview.

**Fix.** Query newest-first (`sortBy(created_at, desc) take(100)`) and reverse for display, and add
`onEndReached`-driven pagination (the repo already supports `limit`/`offset` in
`queryMessagesByConversation`).

---

## [BUG] Long messages break at the server/sync boundary (255-char cap, no client guard)
**Labels:** bug, chat, server, high
**Severity:** High

**Summary.** The server caps message `content` at 255 chars, but the composer has no `maxLength` and
is not `multiline`, so users can compose longer messages that then fail server-side sync (obs #9).

**Evidence.** Server: `server/app/models/message.py` `content: str = Field(max_length=255, min_length=1)`.
Client: `app/(drawer)/(tabs)/chat/[id].tsx:679-691` `TextInput` has no `maxLength`/`multiline`.

**Failure scenario.** User sends a 300-char message; it appears locally (WatermelonDB has no cap) but is
rejected/truncated on server sync, diverging local vs server state.

**Fix.** Decide a shared limit; enforce `maxLength` (and `multiline`) on the composer with a counter, and
raise/relax the server column length to match. Validate at both boundaries.

---

## [BUG] Rejecting a call shows "call ended" to the caller instead of "call rejected"
**Labels:** bug, call, medium
**Severity:** Medium

**Summary.** A declined `call-rejected` message hits the `noop` branch of the router (only
`reason === "busy"` is handled), while `terminateCallConnection` additionally emits `call-ended`, which
is what actually drives the caller's UI (obs #20).

**Evidence.** `call-message-router.ts:54-65` (declined → `noop`); `call-service.ts:509-523`
(`rejectIncomingCall` sends `call-rejected` **and** then `terminateCallConnection(..., "rejected")`
which emits `call-ended` at `:580-599`).

**Fix.** Handle `call-rejected` with `reason === "declined"` in the router (emit a dedicated
`call-rejected` UI event), and suppress the redundant `call-ended` emission on the reject path.

---

## [BUG] Cannot end/interrupt a call while it is "reconnecting"
**Labels:** bug, call, medium
**Severity:** Medium-High

**Summary.** On entering `reconnecting`, controls start a 5s auto-hide; once hidden, the full-screen
reconnecting overlay (and the video views) intercept the tap-to-reveal, so the End Call button can't be
brought back or pressed (obs #10).

**Evidence.** `app/(drawer)/(tabs)/call/[id].tsx:160-161` (auto-hide via `showControls`), `:273-277`
(`reconnectingOverlay` = `absoluteFillObject`, `zIndex:5`, **no** `pointerEvents="none"`), `:184-190`
(tap-to-reveal `Pressable`).

**Fix.** Add `pointerEvents="none"` to the reconnecting overlay, and pin the control row during
`reconnecting` (as is already done for the `calling` state) so End Call stays reachable.

---

## [BUG] Unread badge never clears for admin conversations
**Labels:** bug, chat, medium
**Severity:** Medium

**Summary.** `markConversationAsRead` is only invoked when `isConnected` is true (a live P2P link).
Admin messages arrive via the server without a live P2P data channel, so the read-reset never runs and
the unread badge persists (obs #21).

**Evidence.** `app/(drawer)/(tabs)/chat/[id].tsx:419-437` — guard `if ((!isConnected && !isSelfChat &&
!isSmsConversation) || !conversationId) return;` before `markConversationAsRead`. Badge source:
`chat-list.tsx:95-117` counts statuses `!= READ`.

**Fix.** Allow marking-as-read on view regardless of `isConnected` for server-reachable/admin
conversations (mirror the SMS/self-chat exemption), or key the reset off "conversation focused" rather
than link health.

---

## [BUG] Location permission is not requested before GPS streaming
**Labels:** bug, gps, permissions, medium
**Severity:** Medium

**Summary.** The rescuer location-streaming service calls `watchPositionAsync` without ever requesting
permission; the only `requestForegroundPermissionsAsync` is in `useLocationPermission`, used solely by
`map.tsx`. A rescuer who never opens the map streams nothing, silently (obs #19).

**Evidence.** `features/gps/services/gps-location-service.ts:45` (`watchPositionAsync`, no permission
request); `features/gps/hooks/useLocationPermission.ts:8` (only requester); used only in
`app/(drawer)/(tabs)/map.tsx`. Also violates the CLAUDE.md permission-state convention (the hook
collapses `not-asked` vs `denied`).

**Fix.** Request (and gate on) foreground location permission inside `useGpsStreaming`/
`gps-location-service` before `watchPositionAsync`, rendering distinct `not-asked`/`denied`/`granted` UI.

---

## [BUG] No hardware back handling in the call room (dangling call on back)
**Labels:** bug, call, medium
**Severity:** Medium

**Summary.** The call room has no `BackHandler`; pressing the Android hardware back button navigates away
without ending the call, leaving a dangling session (the on-screen "back" only `minimize`s) (obs #1).

**Evidence.** `app/(drawer)/(tabs)/call/[id].tsx` — no `BackHandler`; the only back affordance is the
`minimize` chevron (`:198-203`).

**Fix.** Intercept hardware back in the call room and route it to `minimize` (or an explicit end-call
confirmation) rather than a bare screen pop.

---

## [BUG] Admin sync can skip data and drop queued mutations
**Labels:** bug, admin, sync, high
**Severity:** High

**Summary.** Two correctness problems in the admin sync engine (obs #12):
1. `pull()` advances the global cursor (`setLastPulledAt(timestamp)`) on **every** page, before
   multi-page pagination finishes. If a later page errors, the cursor has already moved past unfetched
   changes → they are permanently skipped.
2. `push()` reads the mutation queue, does async network work, then `saveQueue([])` clears the **entire**
   queue on success — any mutation enqueued during the push is silently lost (lost-update race).

**Evidence.** `admin-frontend/sapot-admin/lib/sync/syncEngine.ts:28` (per-page cursor advance), `:91-135`
(`push()` reads queue at `:94`, clears all at `:132`).

**Fix.** Only persist the cursor after the full pagination loop completes (or use the per-table
`next_cursor` as the resume point). On push success, clear **only** the mutations that were included in
the pushed batch (diff by id), not the whole queue. Ensure `applyChanges` is idempotent given the
smallest-cursor re-pull.

---

## [BUG] No server-side database migration mechanism
**Labels:** tech-debt, server, high
**Severity:** High

**Summary.** The server creates schema via `SQLModel.metadata.create_all(engine)` only. `create_all`
creates missing tables but never alters existing ones, so any column/enum change is not applied to an
existing database — divergence and runtime errors on schema evolution (obs #3).

**Evidence.** `server/app/db_operations/auth.py:41` (`SQLModel.metadata.create_all(engine)`); no
Alembic/migrations directory in `server/`. (Contrast: the mobile app has versioned WatermelonDB
migrations, `features/shared/database/migrations.ts`.)

**Fix.** Introduce Alembic (autogenerate + reviewed migrations) and run migrations on deploy instead of
relying on `create_all`.

---

## [ENHANCEMENT] Remove the scroll-to-accept requirement in Terms & Conditions
**Labels:** enhancement, auth
**Severity:** Low

**Summary.** Accept is disabled until the user scrolls to the bottom. Product wants this gate removed
(obs #8).

**Evidence.** `features/auth/components/terms-modal.tsx:177` (`disabled={... || !hasScrolledToBottom}`),
`:107-113` scroll tracking, `:160-167` "Scroll to the bottom to accept" hint.

**Fix.** Remove `!hasScrolledToBottom` from the Accept `disabled` condition and drop the scroll
tracking/hint.

---

## [ENHANCEMENT] Remove the encryption PIN
**Labels:** enhancement, auth, security-review
**Severity:** N/A (product decision)

**Summary.** Remove the PIN gate feature (obs #14).

**Evidence.** `features/auth/components/pin-entry-gate.tsx`,
`app/(drawer)/settings/account/encryption-pin.tsx`, `features/shared/core/stores/secure-config.ts`,
`features/shared/crypto/local-encryption-service.ts`.

**Note.** The PIN participates in at-rest key handling — removing it needs a security review of how the
local encryption key is protected afterwards.

---

## [ENHANCEMENT] Remove linked_message_id
**Labels:** enhancement, chat
**Severity:** Low-Medium

**Summary.** Remove the self-referential message link field (obs #15).

**Evidence.** Server `server/app/models/message.py` `linked_message_id`; mobile `linkedMessageId`
(`message-repository.ts:236`, used by `sendChatMessageWithSms` to pair P2P↔SMS messages).

**Note.** It currently backs the "one bubble for dual P2P+SMS send" UX — confirm that flow is being
dropped too before removing the column.

---

## Needs repro before filing (🟡 — no draft yet)

- **#5 Online icon in LAN mode** — LAN path is implemented end-to-end (mDNS `serviceResolved` →
  `peerService.register({markOnline:true})` → `peers.is_online` → `usePeerListData` LAN branch). Reproduce
  on-device and capture whether `serviceResolved`/TXT `id` actually fires before filing.
- **#7 Missing error handling in calls** — error handling is broadly present; only minor fire-and-forget
  gaps (e.g. `use-call-lifecycle.ts:61` `startCall`). Needs a concrete failing scenario.
- **#11 Guest login when server unavailable** — the guest login path is offline-safe; reproduce the exact
  failure (likely MainContainer init or WS-encryption startup) and capture the error/stack.
- **#13 Encryption in admin** — derivation matches mobile; the real risks are the single-key cache (no
  historical candidates like mobile `conversation-key-manager.ts:66-74`) and silent plaintext/ciphertext
  fallback (`adminEncryption.ts:76,87`). Confirm a concrete decrypt-failure case, then file.
