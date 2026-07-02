# Networking and LAN Model

SAPOT operates entirely on a local-area network without internet connectivity. This document describes how the network is structured and how devices communicate on it.

---

## LAN infrastructure

The network is built on a **MikroTik router** that provides:
- Wi-Fi access point (SAPOT LAN SSID)
- DHCP server (assigns private IP addresses to devices)
- Captive portal (hotspot login for device onboarding)
- RouterOS API (polled by the server for telemetry)

All devices (server, mobile devices, admin workstations) join the same LAN subnet with direct routability between them.

---

## Peer discovery: mDNS / Zeroconf

The mobile app advertises its TCP service over **mDNS (Zeroconf)** using `react-native-zeroconf`. Each device announces:
- Its service type
- Its LAN IP address
- Its TCP listener port

Other devices discover peers by browsing for this service type. Discovery is fully peer-to-peer and does not require the server. When a device's IP changes (DHCP renewal), it re-announces so peers can update their address book.

---

## Direct peer messaging: LAN TCP + TLS

Once a peer's IP and port are known via mDNS, the mobile app opens a **TCP + TLS connection** directly (`react-native-tcp-socket`) without the server. Messages are also E2E-encrypted at the application layer on top of TLS.

This path is used when:
- The server WebSocket is unavailable
- Direct LAN delivery is preferred for latency

---

## WebRTC peer-to-peer calls

Voice and video calls use **WebRTC P2P**. The server relays only SDP and ICE signalling messages (see [data-flow.md](data-flow.md)).

Since all devices are on the same LAN, ICE typically resolves to a direct host candidate without STUN/TURN traversal. The server never carries media.

---

## Captive portal onboarding

When a new device joins the SAPOT Wi-Fi:
1. MikroTik intercepts HTTP and serves the captive portal login page (`captive-portal/`).
2. The user logs in (or is admitted as a guest).
3. MikroTik notifies the server: `POST /portal/api/v1/guests/`.
4. The device gains full LAN access.

---

## Server connectivity

The SAPOT server is a fixed node on the LAN (static IP or DHCP reservation). Nginx listens on port 443 (TLS). All mobile REST and WebSocket connections go to this server via `https://<server-LAN-IP>/`.

---

## Internet independence

**Works without internet:** messaging (LAN TCP + WebSocket relay), voice/video calls (WebRTC P2P), GPS sharing, announcements, authentication, offline map tiles, mDNS peer discovery.

**Requires internet (if used):** Sentry error monitoring, EAS build distribution, external email for OTP delivery.

---

> **TODO (human input required):** Document MikroTik configuration steps — SSID setup, DHCP pool, captive portal configuration, RouterOS API credentials, and static IP assignment for the server.
