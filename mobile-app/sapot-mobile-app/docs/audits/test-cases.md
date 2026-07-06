# Test Cases — SAPOT Mobile App

Revised: 2026-06-20

## Execution Type Definitions

| Type | Definition | Tools |
|------|-----------|-------|
| **AUTOMATED** | Runs in CI without human or physical device | Jest, RNTL, Pytest |
| **HYBRID** | Scripted, requires a live device or emulator | Maestro |
| **MANUAL** | Requires a human on a physical device with real hardware or real network | Physical device |

**Sections 1–2** use the format: `ID | Feature | Scenario | Steps | Expected Result | Type | Execution | Priority | Risk`  
**Sections 3–21** use the format: `ID | Feature | Scenario | Preconditions | Steps | Expected Result | Priority | Severity | Automate`  
— where `Automate` carries the execution tool. For MANUAL tests the Automate column reads `MANUAL (physical device)`.

**Section 21** (Real Device / Real Network) consolidates multi-device and real-network cases and uses the full Sections 3–21 format.

Priority: P0 (must-pass), P1 (high), P2 (medium), P3 (low)

---

## Precondition Setup Reference

> For seeded accounts, state-control API calls, OTP test mode, and the Jest login fixture, see [`test-data-environment.md`](./test-data-environment.md).

The table below is a quick-reference for precondition states. Full setup procedures (SQL, shell scripts, seed script) are in the appendix above.

| State | How to produce |
|-------|----------------|
| **Logged in (auth user)** | 1. Select Server mode on Getting Started screen 2. Enter valid credentials 3. Tap Login → navigates to Chats tab |
| **Guest user / Guest with messages** | 1. Select LAN mode 2. Enter first + last name 3. Tap Login 4. Open chat with any discovered peer 5. Send or receive at least one message |
| **Conversations exist in DB** | Follow "Logged in (auth user)" then send or receive at least one message with each peer |
| **5+ prior failed attempts** | Attempt login 5 times with an incorrect password, or use the staging admin API: `POST /admin/simulate-lockout?username=<x>&count=5` |
| **Account banned** | Use the staging admin API: `POST /admin/ban?userId=<x>` |
| **Session > 60 days old** | Use the staging admin API: `POST /admin/age-session?userId=<x>&days=61` |
| **OTP > 10 min old** | Request OTP, then wait 11 minutes before submitting; or use staging admin API: `POST /admin/expire-otp?userId=<x>` |
| **Token > 30 min old** | Request a reset token, wait 31 minutes; or use staging admin API: `POST /admin/expire-reset-token?userId=<x>` |
| **Recovery-key cooldown active** | Generate a recovery key (TC-072), then immediately navigate back to Generate Recovery Key; or use `POST /admin/set-key-cooldown?userId=<x>&days=N` |
| **Peer discovered** | Both devices on the same WiFi in LAN mode; wait up to 10 s for mDNS discovery |
| **WebRTC connected** | Open a chat room with a discovered peer and wait for the "Connected" status indicator |
| **TCP connected** | Open a chat room with a LAN peer; confirm TCP status in the chat room header |
| **Messages queued (offline peer)** | Put the receiver device in airplane mode; send messages from the sender device |
| **Expired announcements** | Use the staging admin API: `POST /admin/expire-announcement?id=<x>`, or set `expiry_date` in the past via direct DB edit on staging |
| **Migration complete** | Follow TC-260 (Guest Migration) through to completion |

---

## 1. Getting Started / Mode Select

| ID | Feature | Scenario | Steps | Expected Result | Type | Execution | Priority | Risk |
|----|---------|----------|-------|-----------------|------|-----------|----------|------|
| TC-001 | Mode Select | Server mode: backend reachable | 1. Launch app (backend running) 2. Tap "Server" 3. Tap "Proceed" | Navigates to Server Login; AppModeStore set to "server" | HYBRID | Maestro | P0 | Critical |
| TC-002 | Mode Select | Server mode: backend unreachable | 1. Launch app (backend offline) 2. Tap "Server" 3. Tap "Proceed" | "Connection Failed" dialog shown with Retry + "Use LAN Mode" | HYBRID | Maestro | P0 | Critical |
| TC-003 | Mode Select | Retry after connection failure recovers | 1. Dialog shown (backend restored) 2. Tap "Retry" | Health check re-runs; navigates to Server Login | HYBRID | Maestro | P1 | High |
| TC-004 | Mode Select | Switch to LAN from failure dialog | 1. Dialog shown 2. Tap "Use LAN Mode" | AppModeStore set to "lan"; navigates to LAN Login | HYBRID | Maestro | P1 | High |
| TC-005 | Mode Select | LAN mode skips backend check | 1. Tap "LAN" 2. Tap "Proceed" | Navigates to LAN Login; no health check made | HYBRID | Maestro | P0 | Critical |
| TC-006 | Mode Select | Mode persists across restart | 1. Select Server mode 2. Kill and relaunch app | App skips mode select; goes to appropriate login | HYBRID | Maestro | P1 | High |

---

## 2. Server Login

| ID | Feature | Scenario | Steps | Expected Result | Type | Execution | Priority | Risk |
|----|---------|----------|-------|-----------------|------|-----------|----------|------|
| TC-010 | Server Login | Successful login | 1. Enter valid username + password 2. Tap Login | Tokens stored; MainContainer initialized; navigates to Chats tab | HYBRID | Maestro | P0 | Critical |
| TC-011 | Server Login | Wrong password | 1. Enter valid username, wrong password 2. Tap Login | Error shown; AttemptsWarning shows remaining attempts | AUTOMATED | RNTL | P0 | Critical |
| TC-012 | Server Login | Non-existent username | 1. Enter unknown username + any password 2. Tap Login | Generic error (not "user not found" — enumeration protection) | AUTOMATED | RNTL | P0 | Critical |
| TC-013 | Server Login | Account locked out | 1. (5+ prior failed attempts) 2. Attempt login | LockoutBanner shown with countdown; form disabled | AUTOMATED | RNTL | P0 | Critical |
| TC-014 | Server Login | Account banned | 1. Enter valid credentials for banned account 2. Tap Login | BannedBanner shown with ban message | AUTOMATED | RNTL | P0 | Critical |
| TC-015 | Server Login | Login times out (30 s) | 1. Enter valid credentials 2. Backend stalls > 30 s | Timeout error; loading state cleared | AUTOMATED | Jest | P1 | High |
| TC-016 | Server Login | Login blocked when server offline | 1. No network connectivity 2. Attempt login | Submit button disabled; no network request is made | AUTOMATED | RNTL | P1 | High |
| TC-017 | Server Login | Navigate to forgot password | 1. On login screen 2. Tap "Forgot password?" | Navigates to forgot-password method picker | HYBRID | Maestro | P1 | High |
| TC-018 | Server Login | Empty fields validation | 1. Leave both fields empty 2. Tap Login | Validation errors shown per field | AUTOMATED | RNTL | P2 | Medium |
| TC-019 | Server Login | Refresh token auto-renews expiring session | 1. Perform any authenticated action with expiring access token | Interceptor refreshes silently; action succeeds | AUTOMATED | Jest | P0 | Critical |
| TC-020 | Server Login | Expired refresh token forces re-login | 1. Open app with session > 60 days old | Session cleared; redirected to login | AUTOMATED | Jest | P0 | Critical |

---

## 3. Guest (LAN) Login

| ID | Feature | Scenario | Preconditions | Steps | Expected Result | Priority | Severity | Automate |
|----|---------|----------|---------------|-------|-----------------|----------|----------|----------|
| TC-030 | LAN Login | Successful guest login | LAN mode selected | 1. Enter first + last name 2. Tap Login | Guest identity created; navigates to Chats; mode = "lan" | P0 | Critical | Maestro |
| TC-031 | LAN Login | Empty first name rejected | | 1. Leave first name empty 2. Tap Login | Validation error for first name | P1 | High | RNTL |
| TC-032 | LAN Login | Empty last name rejected | | 1. Leave last name empty 2. Tap Login | Validation error for last name | P1 | High | RNTL |
| TC-033 | LAN Login | Guest cannot see Public Chat tab | Logged in as guest | 1. View tabs | Public Chat tab is absent | P0 | Critical | Maestro |
| TC-034 | LAN Login | Guest cannot see Map tab | Logged in as guest | 1. View tabs | Map tab is absent | P0 | Critical | Maestro |
| TC-035 | LAN Login | Guest mode locked to LAN transport | Logged in as guest | 1. Go to Switch Mode | Only "LAN" selectable; Server and Auto disabled | P0 | Critical | Maestro |
| TC-036 | LAN Login | Guest logout shows warning modal | Logged in as guest | 1. Open drawer 2. Tap Logout | Warning modal: "Your messages and conversations will be lost" | P1 | High | Maestro |
| TC-037 | LAN Login | Guest data cleared on logout | Guest with messages | 1. Confirm logout | WatermelonDB guest data cleared; returns to Getting Started | P0 | Critical | Maestro |

---

## 4. Registration

| ID | Feature | Scenario | Preconditions | Steps | Expected Result | Priority | Severity | Automate |
|----|---------|----------|---------------|-------|-----------------|----------|----------|----------|
| TC-040 | Register | Successful registration | Backend running, unique username | 1. Fill all fields 2. Accept T&C 3. Tap Register | Account created; tokens received; navigates to Chats | P0 | Critical | Maestro |
| TC-041 | Register | Duplicate username | Username taken | 1. Enter taken username (debounce fires) | "Username already taken" inline error | P0 | Critical | RNTL |
| TC-042 | Register | T&C must be accepted | Form filled | 1. Skip T&C 2. Tap Register | Registration blocked | P0 | Critical | RNTL |
| TC-043 | Register | Password too short | | 1. Enter password < 8 chars | Validation error | P1 | High | RNTL |
| TC-044 | Register | Password mismatch | | 1. Enter mismatched passwords 2. Submit | "Passwords do not match" error | P1 | High | RNTL |
| TC-045 | Register | Server offline blocks submission | No connectivity | 1. Fill form 2. Tap Register | Submission blocked; offline error | P1 | High | RNTL |
| TC-046 | Register | Username check debounced (single API call) | | 1. Type username rapidly | Only 1 API call fires after typing stops | P2 | Medium | Jest |
| TC-047 | Register | setPendingPassword called for key derivation | | 1. Complete registration | `setPendingPassword()` called; crypto keys derivable | P0 | Critical | Jest |

---

## 5. Forgot Password

| ID | Feature | Scenario | Preconditions | Steps | Expected Result | Priority | Severity | Automate |
|----|---------|----------|---------------|-------|-----------------|----------|----------|----------|
| TC-050 | Forgot PW | 4 reset method options shown | | 1. Navigate to Forgot Password | Email, SMS, Security Question, Recovery Key options | P1 | High | RNTL |
| TC-051 | Forgot PW (Email) | Valid email OTP flow resets password | Account with email | 1. Choose Email 2. Enter email 3. Enter OTP 4. Enter new password | Password reset; login works | P0 | Critical | Maestro |
| TC-052 | Forgot PW (Email) | Unknown email returns generic success | | 1. Enter unknown email | Generic success message (enumeration protection) | P0 | Critical | Jest |
| TC-053 | Forgot PW (Email) | Expired OTP rejected | OTP > 10 min old | 1. Enter expired OTP | "Code expired" error; must request new code | P1 | High | Jest |
| TC-054 | Forgot PW (SMS) | Valid phone OTP flow resets password | Account with phone | 1. Choose SMS 2. Enter phone 3. Enter OTP 4. Reset | Password reset successfully | P0 | Critical | Maestro |
| TC-055 | Forgot PW (SMS) | 3 wrong OTP attempts triggers lock | | 1. Enter wrong OTP 3 times | 10-minute lock; further attempts blocked | P0 | Critical | Jest |
| TC-056 | Forgot PW (Security Q) | Correct answer resets password | Questions set | 1. Answer correctly 4. Reset | Password reset; question burned | P0 | Critical | Jest |
| TC-057 | Forgot PW (Security Q) | Wrong answer decrements attempts | | 1. Answer incorrectly | Error + remaining attempts shown | P0 | Critical | Jest |
| TC-058 | Forgot PW (Recovery Key) | Valid key file resets password | Key generated | 1. Upload key file 2. Reset | Password reset | P0 | Critical | Maestro |
| TC-059 | Forgot PW (Recovery Key) | Invalid file rejected | | 1. Upload non-key file | Error; reset blocked | P1 | High | Jest |
| TC-060 | Forgot PW | New password < 8 chars rejected | At reset step | 1. Enter short password | Validation error | P1 | High | Jest |
| TC-061 | Forgot PW | Reset token expires after 30 min | Valid token | 1. Follow reset link after 30 min | "Token expired" error | P1 | High | Jest |

---

## 6. Change Password & Recovery Key

| ID | Feature | Scenario | Preconditions | Steps | Expected Result | Priority | Severity | Automate |
|----|---------|----------|---------------|-------|-----------------|----------|----------|----------|
| TC-070 | Change PW | Correct current password changes PW | Logged in | 1. Enter current + new password 2. Submit | Password changed; session valid | P0 | Critical | Maestro |
| TC-071 | Change PW | Wrong current password rejected | Logged in | 1. Enter wrong current password | Error; password unchanged | P0 | Critical | RNTL |
| TC-072 | Recovery Key | Generate downloads key file | Logged in, not in cooldown | 1. Enter password 2. Tap Generate | Key file downloaded; old key invalidated | P0 | Critical | Maestro |
| TC-073 | Recovery Key | Blocked during cooldown | Key generated recently | 1. Navigate to Generate Recovery Key | Cooldown message with days remaining | P0 | Critical | RNTL |

---

## 7. Chats Tab

| ID | Feature | Scenario | Preconditions | Steps | Expected Result | Priority | Severity | Automate |
|----|---------|----------|---------------|-------|-----------------|----------|----------|----------|
| TC-080 | Chats Tab | Discovered peers shown as bubbles | LAN mode, peer on network | 1. Navigate to Chats | Peer bubble per discovered device | P0 | Critical | MANUAL (2-device rig) |
| TC-081 | Chats Tab | Conversations shown in list | Conversations exist in DB | 1. Navigate to Chats | Chat rows: name, last message, timestamp | P0 | Critical | RNTL |
| TC-082 | Chats Tab | Pull-to-refresh triggers sync | Server mode | 1. Pull down | `syncService.syncNow()` called | P1 | High | Jest |
| TC-083 | Chats Tab | Tap peer bubble → Chat Room (source=PEER) | Peer discovered | 1. Tap peer bubble | Navigates to `/chat/[peerId]` with source=PEER | P0 | Critical | MANUAL (2-device rig) |
| TC-084 | Chats Tab | Tap chat row → Chat Room (source=CHAT) | Conversation exists | 1. Tap chat row | Navigates to `/chat/[id]` with source=CHAT | P0 | Critical | Maestro |
| TC-085 | Chats Tab | Search bar tap → Search screen | | 1. Tap search bar | Navigates to `/search` | P1 | High | Maestro |
| TC-086 | Chats Tab | QR icon → QR Scanner | | 1. Tap QR icon | Navigates to `/scan-qr` | P1 | High | Maestro |
| TC-087 | Chats Tab | SMS FAB hidden for guests | Guest user | 1. View Chats | SMS FAB not visible | P0 | Critical | Maestro |
| TC-088 | Chats Tab | SMS FAB disabled without verified phone | Auth user, no phone | 1. View Chats | SMS FAB visible but disabled | P1 | High | RNTL |
| TC-089 | Chats Tab | SMS FAB opens contact dialog | Auth, phone verified, SMS healthy | 1. Tap SMS FAB | "Contact by Phone" dialog with phone input | P1 | High | Maestro |
| TC-090 | Chats Tab | mDNS discovery starts on mount | | 1. Navigate to Chats | Zeroconf scan + publish active | P0 | Critical | Jest |
| TC-091 | Chats Tab | TCP server starts on mount | | 1. Navigate to Chats | `connectionService.startTcpServer()` called | P0 | Critical | Jest |
| TC-092 | Chats Tab | Empty state for new user | No conversations | 1. Navigate to Chats | Empty state message shown | P2 | Medium | RNTL |

---

## 8. Chat Room

| ID | Feature | Scenario | Preconditions | Steps | Expected Result | Priority | Severity | Automate |
|----|---------|----------|---------------|-------|-----------------|----------|----------|----------|
| TC-100 | Chat Room | Send via WebRTC data channel | WebRTC connected | 1. Type + send message | SENDING → SENT → DELIVERED | P0 | Critical | MANUAL (2-device rig) |
| TC-101 | Chat Room | Send via TCP | TCP connected | 1. Type + send message | SENDING → SENT → DELIVERED | P0 | Critical | MANUAL (2-device rig) |
| TC-102 | Chat Room | ACK timeout (12 s) marks NOT_SENT | Peer disconnects after send | 1. Send message 2. Wait 12 s | Message status → NOT_SENT | P0 | Critical | Jest |
| TC-103 | Chat Room | NOT_SENT message retryable | NOT_SENT message exists | 1. Tap "Tap to retry" | Message re-queued | P1 | High | RNTL |
| TC-104 | Chat Room | Messages encrypted at rest | Message saved | 1. Inspect DB content | `messages.content` is encrypted blob, not plaintext | P0 | Critical | Jest |
| TC-105 | Chat Room | Receive message while screen active | Peer sends message | 1. Keep chat room open | Message appears; "seen" receipt sent | P0 | Critical | MANUAL (2-device rig) |
| TC-106 | Chat Room | Seen receipt sent when focused | Unread messages | 1. Open chat room | "seen" message sent to peer | P1 | High | Jest |
| TC-107 | Chat Room | Connecting state on mount | Peer not yet connected | 1. Open chat | "Connecting…" indicator shown | P1 | High | RNTL |
| TC-108 | Chat Room | Failed state after 5 retries | Peer unreachable | 1. Open chat 2. Wait for retries | "Tap to retry" shown; auto-reconnect stops | P0 | Critical | Jest |
| TC-109 | Chat Room | Exponential backoff between retries | Peer unreachable | 1. Open chat | Each successive delay is ≥1.5× the previous; total wait before 5th retry is between 10 s and 30 s | P1 | High | Jest |
| TC-110 | Chat Room | Auto-reconnect on mDNS rediscovery | Peer IP changes | 1. Peer reconnects with new IP | Connection re-established automatically | P0 | Critical | Jest |
| TC-111 | Chat Room | Auto-reconnect on network regain | WiFi drops then restores | 1. Lose and regain WiFi | NetInfo triggers reconnect | P0 | Critical | Jest |
| TC-112 | Chat Room | Audio call icon navigates to Call Room | Connected | 1. Tap audio call | Navigates to `/call/[id]?type=audio` | P0 | Critical | Maestro |
| TC-113 | Chat Room | Video call icon navigates to Call Room | Connected | 1. Tap video call | Navigates to `/call/[id]?type=video` | P0 | Critical | Maestro |
| TC-114 | Chat Room | SMS mode when eligible | Auth, phones verified, SMS healthy | 1. Tap "SMS" chip | SMS mode active | P1 | High | Maestro |
| TC-115 | Chat Room | SMS mode hidden for guests | Guest user | 1. Open chat | SMS chip not shown | P0 | Critical | RNTL |
| TC-116 | Chat Room | SMS warning banner in SMS mode | SMS mode active | 1. Switch to SMS mode | "Not E2E encrypted" banner shown | P0 | Critical | RNTL |
| TC-117 | Chat Room | Self-chat always "connected" | Own peer ID | 1. Open self-chat | No TCP/WebRTC; messages save directly as DELIVERED | P1 | High | Jest |
| TC-118 | Chat Room | Admin role badge shown | Peer is admin | 1. Open chat with admin | Purple "Admin" badge shown | P1 | High | RNTL |
| TC-119 | Chat Room | Rescuer role badge shown | Peer is rescuer | 1. Open chat with rescuer | Green "Rescuer" badge shown | P1 | High | RNTL |
| TC-120 | Chat Room | LAN mode blocks WS fallback | LAN mode, no TCP/data channel | 1. Send message without transport | Error thrown; no silent failure | P0 | Critical | Jest |
| TC-121 | Chat Room | Message deduplication by messageId | WS delivers duplicate | 1. Duplicate message arrives | Only one message appears | P0 | Critical | Jest |
| TC-122 | Chat Room | Up to 5 past keys for decryption | Key rotated multiple times | 1. Receive message with old key | Decrypted using historical key | P0 | Critical | Jest |

---

## 9. Incoming Call

| ID | Feature | Scenario | Preconditions | Steps | Expected Result | Priority | Severity | Automate |
|----|---------|----------|---------------|-------|-----------------|----------|----------|----------|
| TC-130 | Incoming Call | Accept audio call | Peer calls | 1. Tap Accept | Mic permission; call answered; Call Room | P0 | Critical | MANUAL (physical device) |
| TC-131 | Incoming Call | Accept video call | Peer video-calls | 1. Tap Accept | Mic + camera permission; Call Room | P0 | Critical | MANUAL (physical device) |
| TC-132 | Incoming Call | Reject call | | 1. Tap Reject | Returns to Chats; call ended; no active call state | P0 | Critical | Maestro |
| TC-133 | Incoming Call | Auto-dismiss after 30 s | No action | 1. Wait 30 seconds | Missed call recorded; screen dismisses | P0 | Critical | Jest |
| TC-134 | Incoming Call | Caller hangs up before answer | Caller cancels | 1. Receive call-ended | Screen dismisses immediately | P0 | Critical | Jest |
| TC-135 | Incoming Call | Mic permission denied blocks accept | Permission denied | 1. Deny mic permission on real device 2. Tap Accept | Blocked; permission denied message shown | P0 | Critical | MANUAL (physical device) |
| TC-136 | Incoming Call | Simultaneous call tie-breaker | Both call each other | 1. Both tap call simultaneously | One side busy; other proceeds | P0 | Critical | Jest |
| TC-137 | Incoming Call | Notification deduplication prevents double nav | Duplicate notification | 1. Receive two notifications for same call | Navigation fires once only | P0 | Critical | Jest |

---

## 10. Call Room

| ID | Feature | Scenario | Preconditions | Steps | Expected Result | Priority | Severity | Automate |
|----|---------|----------|---------------|-------|-----------------|----------|----------|----------|
| TC-140 | Call Room | Outgoing shows "Calling…" | | 1. Initiate call | Calling state shown | P1 | High | RNTL |
| TC-141 | Call Room | No-answer after 30 s | Peer does not answer | 1. Wait 30 s | "No answer" state; call ends | P0 | Critical | Jest |
| TC-142 | Call Room | Transition to connected on answer | Peer answers | 1. Peer answers | Connected state; timer starts; controls shown | P0 | Critical | Maestro |
| TC-143 | Call Room | Mute/unmute mic | Connected, real call | 1. Tap mute 2. Tap unmute | Mic track toggled; icon reflects state; peer hears silence when muted | P0 | Critical | MANUAL (physical device) |
| TC-144 | Call Room | Toggle camera on during audio call | Connected, audio, real device | 1. Tap camera icon | Video track acquired from real camera; activates | P1 | High | MANUAL (physical device) |
| TC-145 | Call Room | Toggle camera off | Camera on, real device | 1. Tap camera icon | Video track disabled; peer sees blank | P1 | High | MANUAL (physical device) |
| TC-146 | Call Room | Switch front/back camera | Camera active, real device | 1. Tap flip | Camera switches between front and rear | P1 | High | MANUAL (physical device) |
| TC-147 | Call Room | Toggle earpiece/speaker | Connected, real device | 1. Tap speaker icon | Audio route changes; audible on speaker | P1 | High | MANUAL (physical device) |
| TC-148 | Call Room | End call | Connected | 1. Tap End | Both disconnected; call log saved; navigate back | P0 | Critical | Maestro |
| TC-149 | Call Room | Minimize continues call | Connected | 1. Press back | Returns to previous screen; CallBanner shown; call active | P0 | Critical | Maestro |
| TC-150 | Call Room | Controls auto-hide after 5 s | Connected | 1. Wait 5 s | Controls fade | P2 | Low | Maestro |
| TC-151 | Call Room | Tap screen shows hidden controls | Controls hidden | 1. Tap screen | Controls appear | P2 | Low | Maestro |
| TC-152 | Call Room | Reconnecting overlay on ICE disruption | Real device, real network | 1. Drop WiFi mid-call 2. Restore WiFi | "Reconnecting…" overlay appears; dismissed on ICE restore | P0 | Critical | MANUAL (physical device + real network) |
| TC-153 | Call Room | Call log saved on end | | 1. End call | CALL_LOG message saved with duration | P0 | Critical | Jest |
| TC-154 | Call Room | Busy state if peer in another call | | 1. Call busy peer | "Busy" shown immediately | P0 | Critical | Jest |

---

## 11. Public Chat

| ID | Feature | Scenario | Preconditions | Steps | Expected Result | Priority | Severity | Automate |
|----|---------|----------|---------------|-------|-----------------|----------|----------|----------|
| TC-160 | Public Chat | Tab hidden for guests | Guest | 1. View tabs | Public Chat absent | P0 | Critical | Maestro |
| TC-161 | Public Chat | Unavailable in LAN mode | LAN mode | 1. Navigate to Public Chat | "Unavailable" screen shown | P0 | Critical | RNTL |
| TC-162 | Public Chat | Messages load on mount | Auth, server mode | 1. Navigate to Public Chat | Recent messages shown | P1 | High | Maestro |
| TC-163 | Public Chat | Send message broadcasts to all | Connected | 1. Send message | All connected users receive it | P0 | Critical | MANUAL (2-device rig) |
| TC-164 | Public Chat | Send disabled when disconnected | WS disconnected | 1. Open while disconnected | Send button disabled | P1 | High | RNTL |
| TC-165 | Public Chat | Load earlier messages | History exists | 1. Tap "Load earlier messages" | Older messages loaded | P1 | High | Maestro |
| TC-166 | Public Chat | Connection status indicator | | 1. Observe header | Green = connected; amber + spinner = connecting | P2 | Medium | RNTL |

---

## 12. GPS / Map

| ID | Feature | Scenario | Preconditions | Steps | Expected Result | Priority | Severity | Automate |
|----|---------|----------|---------------|-------|-----------------|----------|----------|----------|
| TC-170 | Map | Tab visible for rescuers | User is rescuer | 1. View tabs | Map tab visible | P0 | Critical | Maestro |
| TC-171 | Map | Tab hidden for non-rescuers | Regular user | 1. View tabs | Map tab absent | P0 | Critical | Maestro |
| TC-172 | Map | Location denied shows error state | Permission denied | 1. Deny location | Error state + "Open Settings" button | P0 | Critical | Maestro |
| TC-173 | Map | User markers from poll | GPS data exists | 1. Open Map | Pins at user locations | P1 | High | Maestro |
| TC-174 | Map | Poll refreshes every 5 s | Map open | 1. Wait 5 s | Positions updated | P1 | High | Jest |
| TC-175 | Map | Tap marker opens sheet | Marker visible | 1. Tap marker | UserMarkerSheet opens | P1 | High | Maestro |
| TC-176 | Map | Sheet Message button → Chat Room | Sheet open | 1. Tap "Message" | Navigates to Chat Room | P1 | High | Maestro |
| TC-177 | Map | View Path fetches and renders history | Sheet open | 1. Tap "View Path" | Last 50 points rendered as red gradient path | P1 | High | Maestro |
| TC-178 | Map | Empty state when no one sharing | No GPS data | 1. Open Map | Empty state message | P2 | Medium | RNTL |
| TC-179 | Map | "No history" for <2 points | 1 GPS point | 1. Tap "View Path" | "No history" banner | P2 | Medium | RNTL |
| TC-180 | GPS Streaming | Starts when enabled + auth + permission | Sharing=true, auth, granted | 1. Enable sharing | WS opens; coordinates stream | P0 | Critical | Jest |
| TC-181 | GPS Streaming | Does not start for guests | Guest | 1. Enable GPS | Streaming does not start | P0 | Critical | Jest |
| TC-182 | GPS Streaming | Stops when sharing disabled | Streaming active | 1. Toggle off | WS closed | P0 | Critical | Jest |
| TC-183 | GPS Streaming | Auto-reconnects after 3 s | WS drops | 1. Simulate WS disconnect | Reconnects after 3 s | P1 | High | Jest |
| TC-184 | GPS Settings | Toggle persists across restart | GPS enabled | 1. Kill + reopen app | GPS preference retained | P1 | High | Maestro |

---

## 13. QR Scanner

| ID | Feature | Scenario | Preconditions | Steps | Expected Result | Priority | Severity | Automate |
|----|---------|----------|---------------|-------|-----------------|----------|----------|----------|
| TC-190 | QR Scanner | Camera permission requested on open | | 1. Navigate to QR Scanner | Camera permission prompt | P0 | Critical | Maestro |
| TC-191 | QR Scanner | Camera denied shows message | Denied | 1. Deny camera | Permission denied message in scanner | P0 | Critical | Maestro |
| TC-192 | QR Scanner | Valid QR → Chat Room (server mode) | Peer's QR, server mode | 1. Scan valid QR | Peer upserted; navigates to Chat Room | P0 | Critical | Maestro |
| TC-193 | QR Scanner | Valid QR in LAN requires ip/port | LAN mode | 1. Scan QR without ip/port | "Invalid QR code" badge for 4 s | P0 | Critical | RNTL |
| TC-194 | QR Scanner | Invalid QR payload shows error | | 1. Scan non-SAPOT QR | "Invalid QR code" badge 4 s then reset | P1 | High | RNTL |
| TC-195 | QR Scanner | Pick image with QR from library | | 1. Tap "Pick Image" 2. Select valid image | QR decoded; navigates to Chat Room | P1 | High | Maestro |
| TC-196 | QR Code (own) | QR contains correct payload in server mode | Server mode | 1. Navigate to QR Code settings | QR has `{id, firstName, username}` | P1 | High | Maestro |
| TC-197 | QR Code (own) | QR contains ip/port in LAN mode | LAN mode, IP assigned | 1. Navigate to QR Code settings | QR has `{id, firstName, ip, port}` | P1 | High | Maestro |

---

## 14. Announcements

| ID | Feature | Scenario | Preconditions | Steps | Expected Result | Priority | Severity | Automate |
|----|---------|----------|---------------|-------|-----------------|----------|----------|----------|
| TC-200 | Announcements | Loads role-filtered list | Auth user | 1. Navigate to Announcements | Role-appropriate announcements shown | P1 | High | Maestro |
| TC-201 | Announcements | Rescuers see more than regular users | | Compare counts | Rescuer sees rescuer+user; user sees user only | P1 | High | Jest |
| TC-202 | Announcements | Expired announcements hidden | Some expired | 1. View list | Only active announcements | P0 | Critical | Jest |
| TC-203 | Announcements | Filter by priority works | | 1. Tap High filter | Only high-priority shown | P2 | Medium | Maestro |
| TC-204 | Announcements | "N new" badge shown | Unread announcements | 1. View header | Badge shows new count | P2 | Medium | RNTL |
| TC-205 | Announcements | markAllSeen called on focus | | 1. Navigate to screen | Badge cleared on next visit | P2 | Medium | Jest |

---

## 15. Profile & Settings

| ID | Feature | Scenario | Preconditions | Steps | Expected Result | Priority | Severity | Automate |
|----|---------|----------|---------------|-------|-----------------|----------|----------|----------|
| TC-210 | Manage Profile | Upload photo via camera | Auth user | 1. Tap Change Photo → Take Photo | Photo uploaded; shown in app | P1 | High | MANUAL (physical device) |
| TC-211 | Manage Profile | Upload photo from library | Auth user | 1. Tap Change Photo → Upload | Picker opens; photo uploaded | P1 | High | MANUAL (physical device) |
| TC-212 | Manage Profile | Guest cannot upload photo | Guest | 1. Navigate to Manage Profile | Photo upload option absent | P0 | Critical | RNTL |
| TC-213 | Manage Profile | Re-auth required before changing email | Auth | 1. Tap Change Email | Re-auth modal shown | P0 | Critical | Maestro |
| TC-214 | Manage Profile | Re-auth required before changing phone | Auth | 1. Tap Change Phone | Re-auth modal shown | P0 | Critical | Maestro |
| TC-215 | Settings | Guest sees "Authenticate" not "Password & Security" | Guest | 1. Open Settings | "Authenticate" shown; "Password & Security" absent | P0 | Critical | RNTL |
| TC-216 | Switch Mode | Change from server to LAN | Auth, server mode | 1. Select LAN | AppModeStore updated; transport restarted | P1 | High | Maestro |
| TC-217 | Switch Mode | Guest cannot select server/auto | Guest | 1. Open Switch Mode | Server and Auto disabled | P0 | Critical | RNTL |
| TC-218 | Theme | Selection persists across restart | | 1. Select dark 2. Kill + reopen | Dark theme applied | P2 | Low | Maestro |

---

## 16. Background Task & Notifications

| ID | Feature | Scenario | Preconditions | Steps | Expected Result | Priority | Severity | Automate |
|----|---------|----------|---------------|-------|-----------------|----------|----------|----------|
| TC-220 | Background Task | Registered on app start | | 1. Launch app | SIGNALING_TASK registered | P0 | Critical | Jest |
| TC-221 | Background Task | App-alive flag prevents duplicate transport | Foreground app | 1. App in foreground | `appAlive=true`; background task skips | P0 | Critical | Jest |
| TC-222 | Background Task | Starts transport when app killed | App killed | 1. Background task fires | TcpServer + WsSignaling + Zeroconf start | P0 | Critical | Jest |
| TC-223 | Background Task | Incoming call notification fires | App killed on real device | 1. Kill app 2. Peer sends audio-call message | `incoming-call` notification appears with ringtone | P0 | Critical | MANUAL (physical device) |
| TC-224 | Background Task | Notification dismissed on call-ended | Notification shown, real device | 1. Leave notification 2. Caller hangs up | Notification dismissed automatically | P0 | Critical | MANUAL (physical device) |
| TC-225 | Notifications | Tap call notification → Incoming Call screen | App in background, real device | 1. Receive call notification 2. Tap it | Opens `/call/incoming` with caller info | P0 | Critical | MANUAL (physical device) |
| TC-226 | Notifications | Tap message notification → Chat Room | App in background, real device | 1. Receive message notification 2. Tap it | Opens `/chat/[id]` | P1 | High | MANUAL (physical device) |
| TC-227 | Notifications | Cold start from killed app | App killed, real device | 1. Kill app 2. Receive call 3. Tap notification | `getLastNotificationResponseAsync()` used; Incoming Call shown | P0 | Critical | MANUAL (physical device) |
| TC-228 | Notifications | Deduplication prevents double navigation | Duplicate notification | 1. Both foreground + background arrive | Navigation fires once only | P0 | Critical | Jest |

---

## 17. Offline / Network Interruption

| ID | Feature | Scenario | Preconditions | Steps | Expected Result | Priority | Severity | Automate |
|----|---------|----------|---------------|-------|-----------------|----------|----------|----------|
| TC-230 | Offline | Chat message queued for offline WS peer | Peer offline | 1. Send message | Server queues; delivers on peer reconnect | P0 | Critical | Jest |
| TC-231 | Offline | Server-ack sent to sender when queued | Sender online, receiver offline | 1. Send message | Sender receives `server-ack` | P0 | Critical | Jest |
| TC-232 | Offline | Queued messages drained on peer reconnect | Messages queued | 1. Target reconnects | All messages delivered in order | P0 | Critical | Jest |
| TC-233 | Offline | ACK deletes queue entry | | 1. Receiver sends `ack` | Queue entry deleted | P0 | Critical | Jest |
| TC-234 | Offline | Sync retries with exponential backoff | Server unreachable | 1. Trigger sync offline | Up to 5 retries; max 30 s delay | P0 | Critical | Jest |
| TC-235 | Offline | ServerStatusBanner in server/auto mode | Server down | 1. Lose server connectivity | Banner shown | P1 | High | RNTL |
| TC-236 | Offline | No banner in LAN mode | LAN mode, server down | 1. Navigate to Chats | No server-offline banner | P1 | High | RNTL |
| TC-237 | Offline | LAN chat works when server down | LAN mode | 1. Lose server 2. Chat with LAN peer | Chat works via TCP; no errors | P0 | Critical | MANUAL (2-device rig) |

---

## 18. Encryption & Security

| ID | Feature | Scenario | Preconditions | Steps | Expected Result | Priority | Severity | Automate |
|----|---------|----------|---------------|-------|-----------------|----------|----------|----------|
| TC-240 | Encryption | TCP traffic is encrypted | TCP connection | 1. Inspect TCP stream | Bytes; no plaintext content | P0 | Critical | Jest |
| TC-241 | Encryption | WS relay payloads encrypted E2E | Server relay | 1. Inspect WS payload on server | Encrypted blob; server cannot read | P0 | Critical | Jest |
| TC-242 | Encryption | Messages encrypted at rest in DB | Message saved | 1. Query DB | `content` field is encrypted | P0 | Critical | Jest |
| TC-243 | Encryption | Key history decrypts old messages | Key rotated | 1. Receive message encrypted with old key | Decrypted successfully | P0 | Critical | Jest |
| TC-244 | Key Recovery | PBKDF2 is deterministic | Known inputs | 1. Derive key twice | Same key both times | P0 | Critical | Jest |
| TC-245 | Key Recovery | Wrong recovery key rejected | | 1. Provide wrong key | Recovery blocked | P0 | Critical | Jest |
| TC-246 | Security | Testing endpoints require admin auth | Admin token required | 1. POST `/testing/test-make-admin` without token 2. POST with non-admin token 3. POST with admin token | Steps 1–2 return 401/403; step 3 returns 200 | P0 | Critical | Pytest |
| TC-247 | Security | GPS monitor WS requires valid rescuer token | | 1. Connect to `/gps/ws/monitor/rescuers/{id}` without token 2. Connect with non-rescuer token 3. Connect with mismatched rescuer ID 4. Connect with valid rescuer token and matching ID | Steps 1–3 close with code 1008; step 4 connects successfully | P0 | Critical | Pytest |
| TC-248 | Security | `/auth/exists` rate-limited | | 1. Send 100 req/min | Rate limit applied | P0 | Critical | Pytest |
| TC-249 | Security | Server Host Override not in production build | Prod build | 1. Open drawer | URL override field absent | P0 | Critical | Maestro |
| TC-250 | Security | JWT uses environment secret | Production | 1. Check env | `JWT_SECRET_KEY` set; no hardcoded fallback | P0 | Critical | Pytest |

---

## 19. Guest Migration

| ID | Feature | Scenario | Preconditions | Steps | Expected Result | Priority | Severity | Automate |
|----|---------|----------|---------------|-------|-----------------|----------|----------|----------|
| TC-260 | Guest Migration | Guest can initiate authenticate flow | Guest, has conversations | 1. Settings → Authenticate | Registration flow shown | P0 | Critical | Maestro |
| TC-261 | Guest Migration | Messages re-encrypted with new auth keys | Guest with messages | 1. Complete authenticate | All messages re-encrypted with new ECDH keys | P0 | Critical | Jest |
| TC-262 | Guest Migration | skipEncryptedMessageUpdatesOnNextSync called | Migration complete | 1. Complete authenticate | Next sync skips re-upload of migrated messages | P0 | Critical | Jest |
| TC-263 | Guest Migration | Conversations preserved after migration | Conversations exist | 1. Complete authenticate | All conversations and messages visible after login | P0 | Critical | Maestro |

---

## 20. App Lifecycle

| ID | Feature | Scenario | Preconditions | Steps | Expected Result | Priority | Severity | Automate |
|----|---------|----------|---------------|-------|-----------------|----------|----------|----------|
| TC-270 | App Lifecycle | App-alive flag cleared on kill | App running | 1. Force-close app | `appAlive=false` in secure storage | P0 | Critical | Jest |
| TC-271 | App Lifecycle | IP change updates secure storage | WiFi changes | 1. Switch networks | `NetworkConfig.ipAddress` + port updated in secure storage | P0 | Critical | Jest |
| TC-272 | App Lifecycle | Debounced IP callback fires once | Multiple rapid IP events | 1. Simulate rapid events | Callback fires once after debounce | P1 | High | Jest |
| TC-273 | App Lifecycle | Safe-area insets on all screens | Physical notched device | 1. Navigate all screens on a device with display cutout | No content clipped behind notch or home bar | P1 | High | MANUAL (physical notched device) |
| TC-274 | App Lifecycle | Dark mode uses theme colors throughout | Dark mode enabled | 1. Enable dark mode 2. Navigate all screens | No hardcoded white/black colors visible; all colors from theme | P1 | High | MANUAL (physical device) |
| TC-275 | App Lifecycle | Sensitive data in secure-store only | Rooted or ADB-enabled device | 1. ADB pull app data directory 2. Inspect files | Tokens, keys, config only in `expo-secure-store`; not in AsyncStorage or plaintext files | P0 | Critical | MANUAL (rooted/ADB device) |
| TC-276 | App Lifecycle | Permissions: distinct UI for not-asked/denied/granted | Fresh install, real device | 1. Trigger camera, mic, location, notification permission flows 2. Verify each state | Distinct UI for not-asked vs denied vs granted; no state collapsed | P0 | Critical | MANUAL (physical device, fresh install) |

---

## 21. Real Device / Real Network (Multi-Peer)

> All cases require **two physical devices** (Device A and Device B) unless noted. LAN cases also require both devices on the same WiFi network. Classify as MANUAL until a scripted mock-peer harness is documented and available.

| ID | Feature | Scenario | Preconditions | Steps | Expected Result | Priority | Severity | Automate |
|----|---------|----------|---------------|-------|-----------------|----------|----------|----------|
| TC-280 | P2P Messaging (LAN) | End-to-end message delivery over TCP | Both devices in LAN mode; peer discovered on Device B | 1. Device A opens chat with Device B 2. Device A types and sends a message | Message appears on Device B within 3 s; Device A status → DELIVERED | P0 | Critical | MANUAL (2-device rig) |
| TC-281 | P2P Messaging (Server) | End-to-end message delivery via server relay | Both devices authenticated in server mode; connection established | 1. Device A sends message to Device B | Message appears on Device B; Device A status → DELIVERED | P0 | Critical | MANUAL (2-device rig) |
| TC-282 | P2P Reconnect | Queued message delivered after peer reconnects | Device A and B previously connected; Device B goes offline | 1. Device A sends message while Device B is offline 2. Device B reconnects to network | Message delivered to Device B; Device A status → DELIVERED | P0 | Critical | MANUAL (2-device rig) |
| TC-283 | Audio Call | End-to-end audio call between two physical devices | Both devices authenticated; mic permission granted on both | 1. Device A initiates audio call to Device B 2. Device B taps Accept | Call connects; both parties hear each other; call timer increments | P0 | Critical | MANUAL (2-device rig) |
| TC-284 | Video Call | End-to-end video call between two physical devices | Both devices authenticated; mic and camera permission granted on both | 1. Device A initiates video call to Device B 2. Device B taps Accept | Call connects; video streams in both directions; no freeze within first 30 s | P0 | Critical | MANUAL (2-device rig) |
| TC-285 | Call Reconnect | ICE reconnects after real network disruption mid-call | Audio call active between Device A and Device B | 1. Disable WiFi on Device A for 5 s 2. Re-enable WiFi | "Reconnecting…" overlay appears on Device A; call resumes and overlay dismisses after ICE re-negotiation | P0 | Critical | MANUAL (2-device rig + real network) |
| TC-286 | Public Chat | Broadcast message reaches all connected users | Two authenticated users; both on Public Chat screen in server mode | 1. Device A sends a public message | Message appears on Device B in real time | P0 | Critical | MANUAL (2-device rig) |
| TC-287 | Simultaneous Call | Tie-breaker resolves when both devices call each other at the same instant | Both devices authenticated and mutually connected | 1. Device A and Device B both tap Call on each other simultaneously | Exactly one side is designated caller; exactly one side is callee; one call proceeds cleanly; no stuck or double-call state | P0 | Critical | MANUAL (2-device rig) |
| TC-288 | Call Rejection | Both parties reject simultaneously with no stuck state | Device A calling Device B; incoming screen shown on Device B | 1. Device A and Device B both tap Reject at the same moment | Call ends cleanly on both devices; both return to Chats; no zombie call state | P1 | High | MANUAL (2-device rig) |
| TC-289 | Guest Migration | Peer sees continuity after guest authenticates | Guest Device A has an existing conversation with Device B | 1. Device A completes the Authenticate flow (TC-260) 2. Device A sends a new message to Device B | Device B receives the message; contact identity matches the pre-migration guest | P0 | Critical | MANUAL (2-device rig) |
