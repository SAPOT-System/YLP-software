# Calls — Requirements

## Overview

SAPOT supports peer-to-peer voice and video calls using WebRTC. The server relays only signalling messages (SDP offer/answer, ICE candidates) — media streams flow directly between devices on the LAN.

---

## User Stories

| ID | As a… | I want to… | So that… |
|----|-------|-----------|----------|
| CA-01 | user | initiate a voice call with another user on the LAN | I can speak with them directly |
| CA-02 | user | initiate a video call with another user on the LAN | I can see and speak with them directly |
| CA-03 | user | accept or decline an incoming call | I control whether I answer |
| CA-04 | user | end a call at any time | I can leave the conversation when I'm done |
| CA-05 | user | toggle my microphone on or off during a call | I control what I transmit |
| CA-06 | user | toggle my camera on or off during a video call | I control what I transmit |
| CA-07 | user | switch audio output between earpiece, speakerphone, and Bluetooth headset | I can use the call in different situations |
| CA-08 | user | have call records (who called whom, when, duration) stored | I can see my call history |
| CA-09 | user | be notified of an incoming call even when the app is in the background | I don't miss calls while multitasking |

---

## Functional Requirements

### FR-CA-01 — Call initiation

- Caller sends `{ type: "offer", to: <peer_id>, sdp: ... }` to the server via WebSocket.
- Server relays the offer to the target peer's WebSocket connection.
- Callee responds with `{ type: "answer", to: <caller_id>, sdp: ... }`.
- Both peers exchange ICE candidates via `{ type: "ice-candidate", to: <peer_id>, candidate: ... }`.
- Once signalling completes, media flows directly between devices (see [ADR 0004](../../adr/0004-p2p-calls-with-signalling-relay.md)).

### FR-CA-02 — Call record

- A `call` record is created when a call is initiated:
  - `conversation_id` — the conversation this call belongs to.
  - `initiator_id` — the user who started the call.
  - `type` — `voice` or `video`.
  - `status` — `ringing`, `ongoing`, `ended`, or `missed`.
- `callparticipant` records track who joined, with `joined_at` and `left_at` (nullable until they leave).

### FR-CA-03 — Audio/video controls

- Microphone mute/unmute: toggle local audio track enabled state.
- Camera on/off: toggle local video track enabled state.
- Audio routing managed via `react-native-incall-manager` (earpiece / speakerphone / Bluetooth).

### FR-CA-04 — Background calls

- Incoming call notifications via `expo-notifications` (foreground) and `expo-background-task` (background).
- The background task maintains the WebSocket connection so the device can receive call signalling while the app is not in the foreground.

### FR-CA-05 — Call history

- `call` and `callparticipant` are SyncableModel — synced to WatermelonDB via pull/push sync.
- Call history is displayed from local WatermelonDB, not fetched on demand.

---

## Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-CA-01 | Both devices must be reachable on the LAN — the server does not relay media |
| NFR-CA-02 | No STUN or TURN server is required on a single LAN subnet |
| NFR-CA-03 | Calls require `CAMERA` and `RECORD_AUDIO` Android permissions |
| NFR-CA-04 | The server must never store or forward audio/video streams |

---

## Out of Scope

See [design.md#non-goals](design.md#non-goals) for what this feature explicitly does not cover.
