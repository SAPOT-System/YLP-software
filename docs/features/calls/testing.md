# Calls — Testing

## Strategy

Tests are split across three layers:

| Layer       | Tooling                            | Scope                                          |
|-------------|------------------------------------|-------------------------------------------------|
| Unit        | Jest + React Native Testing Library | CallService state machine, CallMediaService audio routing, WebrtcSessionManager adapter wiring |
| Integration | Jest with mocked adapters          | SignalingService mode selection, SDP/ICE relay path, WatermelonDB persistence |
| E2E         | Maestro (two simulators)           | Full call flow: start → accept → active → end  |

---

## Coverage Targets

| Area                             | Target |
|----------------------------------|--------|
| CallService state transitions    | 100%   |
| SignalingService routing logic   | 100%   |
| WebrtcSessionManager SDP wiring  | 90%+   |
| CallMediaService audio routes    | 100%   |
| WatermelonDB record lifecycle    | 90%+   |
| Overall call feature coverage    | ≥ 80%  |

---

## Mocking Rules

- **WebrtcAdapter** — always mocked in unit and integration tests; never connect to a real ICE agent.
- **react-native-incall-manager** — mock `setSpeakerphoneOn` and `chooseAudioRoute`; assert call args.
- **WsSignalingAdapter / TcpClientAdapter** — mock `send` and `onMessage`; return controlled SDP/ICE payloads.
- **WatermelonDB** — use the in-memory adapter (`@nozbe/watermelondb/adapters/memory`) for integration tests.

---

## Test Cases

### Signalling — Unit / Integration

| Scenario | Expected result |
|----------|-----------------|
| Initiator calls `startCall(peerId, 'voice')` | `WebrtcAdapter.createOffer()` called; offer SDP forwarded to `SignalingService.send()` |
| `SignalingService` in `auto` mode, LAN adapter available | Sends via `TcpClientAdapter`; does not use `WsSignalingAdapter` |
| `SignalingService` in `auto` mode, LAN adapter unavailable | Falls back to `WsSignalingAdapter` |
| `SignalingService` in `server` mode | Always sends via `WsSignalingAdapter` regardless of LAN state |
| Peer receives offer via relay | `WebrtcSessionManager` calls `WebrtcAdapter.setRemoteDescription(offer)` |
| Peer sends answer | Answer SDP relayed back to initiator; `WebrtcAdapter.setRemoteDescription(answer)` called on initiator |
| ICE candidate received | `WebrtcAdapter.addIceCandidate(candidate)` called on the correct adapter |
| ICE candidate send fails (transport error) | Error logged; candidate queued for retry; call not dropped immediately |
| Both sides complete ICE | `onConnectionStateChange` fires `connected`; `CallService` transitions to `active` |

### Call Lifecycle — Unit

| Scenario | Expected result |
|----------|-----------------|
| `startCall` while another call is active | Returns error `CALL_IN_PROGRESS`; no new session created |
| Peer declines incoming call | `CallService` transitions to `ended` with status `declined` |
| Peer does not answer within 30 s | `CallService` transitions to `ended` with status `missed`; timeout cleared |
| `endCall()` called by initiator | `WebrtcAdapter.close()` called; `CallMediaService.stopMedia()` called; `InCallManager.stop()` called |
| `endCall()` called by peer | Same teardown sequence on peer side; call record updated with `ended_at` |

### WatermelonDB Persistence — Integration

| Scenario | Expected result |
|----------|-----------------|
| Call initiated | `call` row created with `status: 'ringing'`; `callparticipant` row created for initiator |
| Call accepted by peer | `call` row updated to `status: 'active'`; `callparticipant` row created for peer with `joined_at` |
| Call ended | `call` row updated to `status: 'ended'`; `callparticipant` rows updated with `left_at` |
| Declined call | `call` row has `status: 'declined'`; no `active` transition recorded |
| Missed call | `call` row has `status: 'missed'`; `ended_at` set to timeout timestamp |

### Audio Routing — Unit

| Scenario | Expected result |
|----------|-----------------|
| `setAudioRoute('earpiece')` | `InCallManager.setSpeakerphoneOn(false)` called once |
| `setAudioRoute('speaker')` | `InCallManager.setSpeakerphoneOn(true)` called once |
| `setAudioRoute('bluetooth')` | `InCallManager.chooseAudioRoute('bluetooth')` called |
| Audio route changed mid-call | Previous route deactivated; new route activated; no media interruption |
| `CallMediaService.stopMedia()` called | `InCallManager.stop()` called; all tracks stopped; streams set to null |

### Call Record Sync — Integration

| Scenario | Expected result |
|----------|-----------------|
| Call ends with network available | `SyncService.schedulePush()` called; `call` and `callparticipant` rows included in push payload |
| Call ends with network unavailable | Rows remain in WatermelonDB; push deferred to next reconnect |
| Push succeeds | Server returns 200; local `updated_at` stays in sync |
| Push returns 409 (conflict) | `SyncService` re-pulls affected rows; local display updated |

---

## E2E Scenarios (Maestro)

```yaml
# calls-voice-flow.yaml
appId: com.ylpsapot.mobile
---
- launchApp
- tapOn: "Conversations"
- tapOn: "Peer Alpha"
- tapOn: "Voice call button"
- assertVisible: "Calling…"
- # On second simulator: accept call
- assertVisible: "Call active"
- tapOn: "End call"
- assertVisible: "Call ended"
- assertNotVisible: "Call active"
```

Run against two simulators: one as initiator, one as peer.

---

## Test File Locations

```
mobile-app/sapot-mobile-app/
  src/
    features/calls/
      __tests__/
        CallService.test.ts
        WebrtcSessionManager.test.ts
        CallMediaService.test.ts
        SignalingService.test.ts
        callPersistence.integration.test.ts
  e2e/
    calls-voice-flow.yaml
    calls-video-flow.yaml
```
