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

## MikroTik configuration

These steps configure a MikroTik router (RouterOS 7.x, via Winbox or `/system` CLI over SSH) as the LAN infrastructure described above.

### 1. Wi-Fi SSID

```
/interface wireless
set [find default-name=wlan1] ssid="SAPOT" mode=ap-bridge disabled=no
```

Use WPA2-PSK with a shared passphrase distributed to responders on-site, or leave open with captive-portal login as the access gate (see [Captive portal onboarding](#captive-portal-onboarding) above) — pick one based on the deployment's threat model ([threat-model.md](threat-model.md)).

### 2. DHCP pool

```
/ip pool add name=sapot-pool ranges=192.168.88.10-192.168.88.254
/ip dhcp-server add name=sapot-dhcp interface=wlan1 address-pool=sapot-pool lease-time=1h
/ip dhcp-server network add address=192.168.88.0/24 gateway=192.168.88.1 dns-server=192.168.88.1
```

Reserve the low end of the subnet (e.g. `.2`–`.9`) for static assignments — the server and the router itself — so the DHCP pool never hands out an address already in use.

### 3. Static IP for the server

Give the server a DHCP lease reservation keyed to its MAC address, rather than a manually-configured static IP on the server itself, so it survives NIC/OS reinstalls:

```
/ip dhcp-server lease add address=192.168.88.2 mac-address=<server-NIC-MAC> server=sapot-dhcp comment="SAPOT server"
```

This is the address the mobile app and admin frontend are configured to reach (`https://<server-LAN-IP>/`, see [Server connectivity](#server-connectivity) above) and the address the GSM module's `SAPOT_API_URL` points at.

### 4. Captive portal

RouterOS's built-in hotspot feature intercepts HTTP and redirects to `captive-portal/`'s login page:

```
/ip hotspot setup
# walk the wizard: hotspot interface = wlan1, address pool = sapot-pool,
# DNS name = (blank, use IP), and point "HTML directory" at the captive-portal build output
```

The hotspot's walled-garden must allow unauthenticated access to the server's `/portal/api/v1/guests/` endpoint (see step 3 in [Captive portal onboarding](#captive-portal-onboarding)) so the portal page can register a guest before the router grants full LAN access:

```
/ip hotspot walled-garden add dst-host=192.168.88.2 action=allow
```

### 5. RouterOS API credentials (for telemetry polling)

The server's `collect_metrics_loop` (see [mikrotik-telemetry.md](../api/mikrotik-telemetry.md)) polls the router over the RouterOS API (port 8728 by default). Create a dedicated, least-privilege API user rather than reusing the router's admin account:

```
/user group add name=sapot-telemetry policy=read,api,!local,!telnet,!ssh,!ftp,!reboot,!write,!policy,!test,!winbox,!password,!web,!sniff,!sensitive,!romon,!dude,!tikapp
/user add name=sapot-api group=sapot-telemetry password=<generate-a-strong-password>
```

> **Security note:** the current server code reads router host/username/password from hardcoded constants in `server/app/db_operations/router_client.py`, not from environment variables, despite [mikrotik-telemetry.md](../api/mikrotik-telemetry.md) documenting them as env-configurable. Treat this as a known gap — do not commit the real API credentials anywhere in the repo, and track moving them to env vars (matching the fail-fast pattern in [SECURITY.md](../../SECURITY.md)) as follow-up work.

### 6. Verify

```
/interface wireless print          # SSID is enabled and broadcasting
/ip dhcp-server lease print         # server's reservation is active
/ip hotspot print                   # hotspot is running on wlan1
```

Then confirm from a client device: join the SSID, get redirected to the captive portal, log in, and confirm LAN access (ping the server's reserved IP).
