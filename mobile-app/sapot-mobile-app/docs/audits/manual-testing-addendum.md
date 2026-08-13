# Manual Testing Addendum — SAPOT Mobile App

Revised: 2026-06-20

This document defines all test scenarios that **cannot be automated or scripted**. Every test here requires a human tester on physical hardware under real-world conditions. Maestro on an emulator is not a substitute for these tests.

---

## 1. Device Matrix

All P0 manual tests must pass on all three tiers. P1 tests require at least mid-range.

| Tier | Example Devices | RAM | Android |
|------|----------------|-----|---------|
| Low-end | Redmi 9A, Samsung A03 | 2 GB | 10–11 |
| Mid-range | Redmi Note 12, Samsung A54 | 4–6 GB | 12–13 |
| High-end | Samsung S23, Pixel 7 | 8–12 GB | 13–14 |

---

## 2. Network Condition Matrix

| Condition | How to Simulate | Used For |
|-----------|----------------|----------|
| Good WiFi | Standard office WiFi | Baseline |
| Weak WiFi (−70 dBm) | Move far from router | Packet loss tests |
| Mobile LTE (real SIM) | Disable WiFi | Handover tests |
| Mobile 2G / Edge | Enable 2G-only in developer options | High-latency tests |
| Airplane mode | Device settings | GPS / offline tests |
| Controlled packet loss | Linux AP: `tc netem loss 30% delay 200ms` | Message delivery tests |
| No internet (LAN only) | Hotspot with no upstream | LAN-only tests |

---

## 3. Pre-Test Setup Checklist

- [ ] App is a **development build** (not Expo Go) unless testing production behavior
- [ ] Backend staging is running (`GET /` returns `{"state":"running"}`)
- [ ] Test accounts ready: 1 regular user, 1 rescuer, 1 admin, 1 guest
- [ ] Two physical devices available for peer-to-peer and call tests
- [ ] Device battery > 50%
- [ ] Device time synchronized
- [ ] OS notifications enabled for SAPOT
- [ ] Background app refresh: Settings → Apps → SAPOT → Battery → Unrestricted
- [ ] Previous sessions cleared: `adb shell pm clear com.sapot.mobile.dev`

---

## 4. Authentication

### MT-001 — Server Login on Low-End Device

**Priority:** P0 | **Device:** Low-end (≤2 GB RAM)

1. Cold-start the app
2. Select Server mode
3. Enter valid credentials and tap Login

**Expected:** Login completes in < 5 s. No ANR. Chats tab loads cleanly.
**Failure indicators:** ANR dialog, blank screen after login, > 8 s delay.

---

### MT-002 — Forgot Password: Real Email OTP

**Priority:** P0 | **Device:** Any

1. Forgot Password → Email
2. Enter a real email attached to a staging account
3. Open the email inbox and enter the OTP
4. Set a new password

**Expected:** Password reset succeeds. Old password invalidated. Login with new password works.

---

### MT-003 — Forgot Password: Real SMS OTP

**Priority:** P0 | **Device:** Any with SIM

1. Forgot Password → SMS
2. Enter a real +63 Philippine mobile number on a staging account
3. Receive and enter the OTP from the real SMS

**Expected:** SMS received within 60 s. OTP accepted. Password reset works.

---

### MT-004 — JWT Secret Not Hardcoded in Production

**Priority:** P0 | **Device:** N/A (server audit)

1. SSH into the production server
2. `echo $JWT_SECRET_KEY` — must be set and not the hardcoded fallback
3. `grep -r "fallback_secret\|your-secret\|changeme" server/app/` — must return no matches

**Expected:** Strong random secret in environment; no hardcoded fallback in source.

---

## 5. Camera and Media

### MT-010 — QR Scan in Poor Lighting

**Priority:** P1 | **Device:** Mid-range

1. Print a peer QR code on paper
2. In dim lighting (~20 lux), open QR Scanner
3. Scan the printed code

**Expected:** Scan succeeds when held steady. Failure shows helpful guidance, not a crash.

---

### MT-011 — Camera Permission: Denied Then Re-Enabled

**Priority:** P0 | **Device:** Any

1. Fresh install → open QR Scanner → Deny camera permission
2. Observe the denied-state UI
3. OS Settings → SAPOT → Permissions → Camera → Allow
4. Return to QR Scanner

**Expected:**
- Step 1: Distinct "denied" UI with "Open Settings" button — not a crash or blank screen
- Step 4: Camera activates without requiring app restart

---

### MT-012 — Profile Photo Upload via Camera

**Priority:** P1 | **Device:** Any with working camera

1. Settings → Manage Profile → Change Photo → Take Photo
2. Camera opens; take a photo and confirm

**Expected:** Photo uploads; visible in the peer's chat room header.

---

## 6. Call Tests (All Require Two Physical Devices)

### MT-020 — End-to-End Audio Call

**Priority:** P0 | **Devices:** Two real devices, same WiFi

1. Device A calls Device B via chat room audio icon
2. Device B accepts
3. Speak on A; listen on B; speak on B; listen on A
4. End the call from Device A

**Expected:**
- Both show "Connected" with running timer
- Voice audible in both directions; no echo or robotic artifact in first 5 s
- Call log entry in both chat histories with correct duration

---

### MT-021 — Video Call with Camera Toggle

**Priority:** P0 | **Devices:** Two real devices

1. Establish a video call
2. Device A: toggle camera off
3. Device A: toggle camera on
4. Device A: switch front ↔ rear camera

**Expected:**
- Step 2: Device B sees a blank/placeholder
- Step 3: Device B sees Device A's video resume
- Step 4: Device B sees the new camera source

---

### MT-022 — Network Handover During Active Call

**Priority:** P0 | **Devices:** Two real devices | **Network:** WiFi + mobile data

1. Establish a voice call over WiFi
2. Disable WiFi on Device A mid-call
3. Device A is now on mobile data; wait 10–15 s
4. Re-enable WiFi on Device A

**Expected:** "Reconnecting…" overlay appears. Call resumes via ICE restart or ends gracefully. No silent failure. No crash.

---

### MT-023 — Bluetooth Audio During Call

**Priority:** P1 | **Device:** Real device + BT headset

1. Pair BT headset before the call
2. Start audio call — audio should route to BT automatically
3. Disconnect headset mid-call

**Expected:**
- Step 2: Audio routes to BT headset
- Step 3: Audio falls back to earpiece; call does not drop; no crash

---

### MT-024: Incoming Call While App is Backgrounded

**Priority:** P0 | **Device:** Real Android device

1. Log in, then send the app to the background without force-stopping it
2. From a second device, call Device A

**Expected:**
- The foreground service has maintained connectivity
- `incoming-call` notification appears with ringtone
- Tapping notification opens the app to Incoming Call screen with correct caller info

---

### MT-025 — Two Simultaneous Incoming Calls

**Priority:** P1 | **Devices:** Three real devices

1. Device B calls Device A
2. While Device A is ringing, Device C also calls Device A

**Expected:** Only one incoming call screen shown. Second call rejected automatically. No crash, no two simultaneous ringing screens.

---

## 7. Background and OS Lifecycle

### MT-030 — Android Doze Mode

**Priority:** P0 | **Device:** Any Android

1. Log in; navigate to Chats (TCP server running)
2. Turn off the screen on battery power; leave idle for 15–30 min
3. From Device B, send a message

**Expected:** Device A receives the notification within the next Doze maintenance window (< 10 min on most devices). Message visible on screen wake.

**Note:** This is the most common production failure mode. If it fails, check battery optimization settings and `WAKE_LOCK` / `FOREGROUND_SERVICE` configuration.

---

### MT-031 — Android Low Memory Killer (LMK)

**Priority:** P0 | **Device:** Low-end (≤2 GB RAM)

1. Log in with active chat history
2. Open 10–15 other memory-intensive apps to exhaust RAM
3. Verify SAPOT process was killed: `adb logcat -d | grep "LowMemoryKiller"`
4. Tap the SAPOT icon to relaunch

**Expected:** App relaunches, restores session, and displays chat history without data loss. No crash on re-initialization.

---

### MT-032 — OTA Update During Active Chat Session

**Priority:** P1 | **Device:** Any

1. Open a chat room with active messages
2. Push an OTA update: `pnpm run update:dev`
3. Wait for bundle reload

**Expected:** App reloads. Auth session survives (tokens intact in secure store). Chat history visible. Connection re-established.

---

### MT-033 — Factory Reset / Keystore Wipe

**Priority:** P0 | **Device:** Any Android

1. Log in; generate a recovery key
2. Factory reset the device
3. Reinstall and log in

**Expected:** `expo-secure-store` items are gone. Login succeeds with credentials. Recovery key (from server) restores encryption keys. No "stale key" crash.

---

## 8. GPS and Location

### MT-040 — Three Distinct Permission States

**Priority:** P0 | **Device:** Any | **Scenario:** Fresh install

1. Fresh install — navigate to Map tab: observe **not-asked** state
2. Tap permission prompt — **Deny**: observe denied state with "Open Settings" button
3. OS Settings → Allow location permission → return to app

**Expected:** Three visually distinct states. Step 3: GPS activates without restart. Never collapse two states into one UI.

---

### MT-041 — GPS in Airplane Mode

**Priority:** P1 | **Device:** Any

1. Enable Airplane mode
2. Open GPS Settings; toggle sharing ON

**Expected:** `GpsLocationService` fails gracefully with an error state. No crash. No infinite spinner.

---

### MT-042 — Network-Only Location (No GPS Fix)

**Priority:** P1 | **Device:** Any | **Location:** Indoors

1. Go indoors with no GPS satellite signal
2. Enable GPS sharing
3. Observe reported location on map

**Expected:** Falls back to network/cell location. App streams whatever is available. No refusal to stream or crash.

---

## 9. Security

### MT-050 — At-Rest Data via ADB Backup

**Priority:** P0 | **Device:** Any with ADB (no root required)

1. Log in; send several messages
2. `adb backup -f backup.ab -noapk com.sapot.mobile.dev`
3. `java -jar abe.jar unpack backup.ab backup.tar`
4. Inspect extracted files for plaintext tokens, keys, or message content

**Expected:** `expo-secure-store` items absent from backup (protected by keystore). Any DB files show encrypted `content` column, not plaintext.

---

### MT-051 — Server Host Override Absent in Production Build

**Priority:** P0 | **Build:** Production

1. Install the production build
2. Open the navigation drawer

**Expected:** "Server Host" text input is completely absent — not just hidden or disabled.

---

### MT-052 — CORS and Credentials

**Priority:** P0 | **Device:** N/A (browser)

1. Browser console on a page with origin `https://evil.com`
2. `fetch('https://sapot.online/auth/token', {credentials: 'include', method: 'POST', body: ...})`

**Expected:** Browser refuses to attach credentials to a cross-origin request. **Current bug:** `allow_origins=["*"]` with `allow_credentials=True` is invalid per spec and must be fixed to list explicit origins.

---

## 10. Network Instability

### MT-060 — Chat Under 30% Packet Loss

**Priority:** P1 | **Devices:** Two physical devices | **Network:** Controlled AP

**Setup:** `tc qdisc add dev wlan0 root netem loss 30% delay 200ms`

1. Exchange 20 messages between devices under degraded network
2. Observe delivery and retry behavior

**Expected:** Timed-out messages show NOT_SENT with "Tap to retry". Retried messages deliver when network recovers. No crash. No silent loss.

---

### MT-061 — LAN Chat With Server Down

**Priority:** P0 | **Devices:** Two physical devices, same WiFi | **No server**

1. Both devices: LAN mode, logged in as guests
2. Stop the backend server entirely
3. Exchange messages

**Expected:** Chat works via TCP. No server-offline errors for LAN messages. ServerStatusBanner NOT shown in LAN mode.

---

### MT-062 — Unstable WiFi (Jitter + Drops)

**Priority:** P0 | **Devices:** Two physical devices | **Network:** Throttled AP

**Setup:** `tc qdisc add dev wlan0 root netem delay 500ms 200ms distribution normal loss 5%`

1. Log in on both devices; send messages, initiate a call, open the map

**Expected:**
- Chat: messages deliver or show NOT_SENT with retry option
- Call: quality degrades but no crash
- Map: poll fails gracefully; retries on next interval
- No unhandled exceptions; no silent infinite spinners

---

## 11. Performance Benchmarks

Record per release and compare to baseline. These are not pass/fail but tracked over time.

| Benchmark | Measure | Target |
|-----------|---------|--------|
| Cold start — low-end | Tap to Chats visible | < 5 s |
| Cold start — mid-range | Tap to Chats visible | < 3 s |
| Chat room open (1,000 msgs) | Tap to last message visible | < 2 s |
| Message list scroll (1,000 msgs) | 500 ms rapid scroll | ≥ 30 fps |
| GPS streaming battery impact | 1 hour active streaming | < 3%/hr |

### MT-070 — Large Message History Performance

**Priority:** P1 | **Device:** Low-end and high-end

1. Populate a conversation with 1,000+ messages
2. Open the conversation; scroll rapidly from bottom to top and back

**Expected:** No dropped frames visible to the eye. No ANR dialog. Memory usage does not grow unboundedly (check with Android Profiler).

---

## 12. Release Checklist (Physical Device Sign-Off)

Run before every release. Record device model and Android version for each row.

| # | Check | Device Tier | Pass/Fail | Notes |
|---|-------|-------------|-----------|-------|
| 1 | Server login → Chats loads | Low-end | | |
| 2 | Guest login → correct LAN-mode tabs | Any | | |
| 3 | Send + receive message (TCP direct) | Two devices | | |
| 4 | Send + receive message (WebRTC data channel) | Two devices | | |
| 5 | Audio call: voice audible both directions | Two devices | | |
| 6 | Video call: camera visible on both ends | Two devices | | |
| 7 | Incoming call notification (app backgrounded, process alive) | Real device | | |
| 8 | Cold-start from call notification | Real device | | |
| 9 | GPS toggle persists across restart | Any | | |
| 10 | Map markers appear (rescuer account) | Any | | |
| 11 | QR scan: peer added + Chat Room opens | Real camera | | |
| 12 | Safe-area insets: no clipped content | Notched device | | |
| 13 | Dark mode: no hardcoded colors | Any | | |
| 14 | Change password end-to-end | Any | | |
| 15 | Recovery key generate + use for reset | Any | | |
| 16 | Server Host Override absent in prod build | Prod build | | |
| 17 | Foreground service keeps connectivity while app is backgrounded | Real device | | |
| 18 | LAN chat works with server offline | Two devices | | |
| 19 | Camera permission: 3 distinct states | Fresh install | | |
| 20 | Mic permission: denied → graceful error on call accept | Real device | | |
