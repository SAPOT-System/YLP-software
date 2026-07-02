# Calls — Requirements

## Overview

SAPOT supports peer-to-peer voice and video calls using WebRTC. The server relays only signalling messages (SDP offer/answer, ICE candidates) — media streams flow directly between devices on the LAN.

---

## User stories

- As a user, I can initiate a voice call with another user on the LAN.
- As a user, I can initiate a video call with another user on the LAN.
- As a user, I can accept or decline an incoming call.
- As a user, I can end a call at any time.
- As a user, I can toggle my microphone on or off during a call.
- As a user, I can toggle my camera on or off during a video call.
- As a user, I can switch audio output between earpiece, speakerphone, and Bluetooth headset.
- As a user, call records (who called whom, when, duration) are stored and visible in my call history.
- As a user, I am notified of an incoming call even when the app is in the background.

---

## Functional requirements

### Call initiation

- Caller sends `{ type: "offer", to: <peer_id>, sdp: ... }` to the server via WebSocket.
- Server relays the offer to the target peer's WebSocket connection.
- Callee responds with `{ type: "answer", to: <caller_id>, sdp: ... }`.
- Both peers exchange ICE candidates via `{ type: "ice-candidate", to: <peer_id>, candidate: ... }`.
- Once signalling completes, media flows directly between devices (see [ADR 0002](../../adr/0002-webrtc-p2p-calls.md)).

### Call record

- A `call` record is created when a call is initiated:
  - `conversation_id` — the conversation this call belongs to.
  - `initiator_id` — the user who started the call.
  - `type` — `voice` or `video`.
  - `status` — `ringing`, `ongoing`, `ended`, or `missed`.
- `callparticipant` records track who joined, with `joined_at` and `left_at` (nullable until they leave).

### Audio/video controls

- Microphone mute/unmute: toggle local audio track enabled state.
- Camera on/off: toggle local video track enabled state.
- Audio routing managed via `react-native-incall-manager` (earpiece / speakerphone / Bluetooth).

### Background calls

- Incoming call notifications via `expo-notifications` (foreground) and `expo-background-task` (background).
- The background task maintains the WebSocket connection so the device can receive call signalling while the app is not in the foreground.

### Call history

- `call` and `callparticipant` are SyncableModel — synced to WatermelonDB via pull/push sync.
- Call history is displayed from local WatermelonDB, not fetched on demand.

---

## Constraints

- Both devices must be reachable on the LAN — the server does not relay media.
- No STUN or TURN server is required on a single LAN subnet.
- Calls require `CAMERA` and `RECORD_AUDIO` Android permissions.
- The server must never store or forward audio/video streams.
