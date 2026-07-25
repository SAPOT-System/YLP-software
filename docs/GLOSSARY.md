# Glossary

| Term | Definition |
|---|---|
| **admin** | System administrator role. Full access to the admin dashboard, user management, and network configuration. |
| **rescuer** | Emergency responder role. Can view GPS locations of other users on the live map, send announcements, and use all communication features. |
| **user** | Authenticated end user. Can message, call, and share GPS with rescuers. Cannot access the admin dashboard. |
| **guest** | Unauthenticated or pre-registration user. Limited to LAN communication; GPS sharing is not available. Guest conversations and keys are migrated to the authenticated account on registration. |
| **LAN** | Local-Area Network. SAPOT operates entirely on a LAN served by a MikroTik router. The LAN replaces the internet during a disaster event. |
| **E2E encryption** | End-to-end encryption of message and call-setup content using NaCl box (ECDH key agreement, per-conversation keys). The server stores or relays only ciphertext and public keys; it never has access to plaintext. See [ADR 0001](adr/0001-nacl-box-for-e2e-encryption.md). |
| **signalling** | The exchange of WebRTC session-description (SDP) and ICE-candidate messages that allow two devices to negotiate a direct peer-to-peer connection. The SAPOT server relays these messages over WebSocket but never sees the media or chat content. Prose always uses this spelling; code identifiers (e.g. `SignalingService`, `signalingKey`) use the American spelling because that's the literal symbol name, not a separate term. |
| **sync** | The incremental pull-then-push cycle that keeps the mobile app's local WatermelonDB database consistent with the server. Only records changed since the last successful pull are exchanged. |
| **mDNS / Zeroconf** | The LAN peer-discovery mechanism. Each mobile app advertises its TCP service over mDNS so other devices on the same network can find it without a central registry. |
| **captive portal** | The MikroTik-hosted login page shown to users when they first connect to the SAPOT Wi-Fi network. |
| **GSM module** | A hardware SMS gateway (FastAPI + pyserial + Arduino) that sends text messages when LAN messaging cannot reach a recipient. |
