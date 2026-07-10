# LAN Server TLS Design

**Date:** 2026-06-04  
**Status:** Approved

## Problem

The mobile app connects to the FastAPI server at `192.168.0.100:8000` over plain HTTP and WebSocket. All traffic — auth tokens, GPS coordinates, call signaling, chat — is transmitted in cleartext on the local network. A passive observer or rogue access point on the same LAN can read or tamper with it.

The existing `android-network-security-config.xml` pins `sapot.online`, a domain the app never connects to. It provides no actual security benefit.

There is also a typo in `config/runtime.ts`: `STAGING_HOST` is set to `193.168.0.100` instead of `192.168.0.100`.

## Goals

- Encrypt all traffic between the Android app and the LAN server using TLS
- Protect against passive sniffing and MITM attacks on the local network
- Work fully offline — no internet required for cert validation
- Leave dev builds (connecting to `DEV_HOST`) unchanged

## Non-Goals

- Public CA-issued certs (server is LAN-only, no domain name)
- iOS support (separate effort)
- Cert rotation automation (manual rotation acceptable for now)

## Architecture

```
App (Android, preview/production build)
  │
  │  TLS — server_cert.pem bundled in APK, verified locally
  │
Server (192.168.0.100:8000, gunicorn + uvicorn)
  │  terminates TLS using self-signed cert
```

Dev builds (`__DEV__` / `APP_VARIANT=development`) connect to `DEV_HOST` over plain HTTP — unaffected by this change.

## Components

### 1. Certificate Generation (one-time, on server machine)

Generate a self-signed RSA-2048 cert with a SAN for the server's IP:

```bash
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout server.key \
  -out server.crt \
  -days 3650 \
  -subj "/CN=192.168.0.100" \
  -addext "subjectAltName=IP:192.168.0.100"
```

| File | Location | Commit? |
|---|---|---|
| `server.key` | Server machine only | No — gitignored |
| `server.crt` | Server + bundled in APK | Yes (public cert) |

Cert validity: 10 years. **Expiry: ~2036-06-04.** Schedule renewal before then.

### 2. Server TLS (`server/runserver.sh`)

Pass `--keyfile` and `--certfile` to gunicorn. No FastAPI code changes needed.

```bash
/home/sapot/YLP-software/server/app/venv/bin/gunicorn app.main:app \
  -k uvicorn.workers.UvicornWorker \
  -w 4 \
  -b 0.0.0.0:8000 \
  --keyfile /home/sapot/certs/server.key \
  --certfile /home/sapot/certs/server.crt
```

The cert files live outside the repo at `/home/sapot/certs/`. The `.env.example` should document the expected paths.

### 3. Android Cert Resource

Copy `server.crt` into the app as a raw Android resource:

```
android/app/src/main/res/raw/server_cert.pem
```

This file is the public cert only. It is safe to commit to git.

### 4. Network Security Config (`android-network-security-config.xml`)

Replace the current file:

```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <!-- Trust only the bundled self-signed cert for the LAN server -->
  <domain-config cleartextTrafficPermitted="false">
    <domain includeSubdomains="false">192.168.0.100</domain>
    <trust-anchors>
      <certificates src="@raw/server_cert"/>
    </trust-anchors>
  </domain-config>

  <!-- Dev builds only: trust user-installed CAs for proxy tools -->
  <debug-overrides>
    <trust-anchors>
      <certificates src="user"/>
    </trust-anchors>
  </debug-overrides>
</network-security-config>
```

- Removes the unused `sapot.online` pinning
- Any cert for `192.168.0.100` other than the bundled one is rejected
- `<debug-overrides>` is ignored by Android in release builds

### 5. Runtime URL Updates (`config/runtime.ts`)

Two changes:

1. Fix typo: `193.168.0.100` → `192.168.0.100`
2. Switch preview/production paths to `https://` and `wss://`

```ts
const STAGING_HOST = "192.168.0.100"; // fixed from 193.168.0.100

export const getApiUrl = () => {
  if (_hostOverride) return `https://${_hostOverride}:${PORT}`;
  if (__DEV__) return `http://${DEV_HOST}:${PORT}`;       // unchanged
  return `https://${STAGING_HOST}:${PORT}`;
};

export const getWsUrl = () => {
  if (_hostOverride) return `wss://${_hostOverride}:${PORT}`;
  if (__DEV__) return `ws://${DEV_HOST}:${PORT}`;         // unchanged
  return `wss://${STAGING_HOST}:${PORT}`;
};

export const getTileServerUrl = () => {
  if (_hostOverride) return `https://${_hostOverride}:${TILE_PORT}`;
  if (__DEV__) return `http://${DEV_HOST}:${TILE_PORT}`;  // unchanged
  return `https://${STAGING_HOST}:${TILE_PORT}`;
};
```

## Data Flow

```
[App: preview/production]
  getApiUrl()  → https://192.168.0.100:8000
  getWsUrl()   → wss://192.168.0.100:8000

[TLS handshake]
  Android checks: does server cert match server_cert.pem?
  match    → connection proceeds
  mismatch → connection rejected (MITM detected)

[App: dev]
  getApiUrl()  → http://<DEV_HOST>:8000  (no change)
  getWsUrl()   → ws://<DEV_HOST>:8000   (no change)
```

## Implementation Order

1. Generate cert on server machine
2. Update `server/runserver.sh`, restart server
3. Copy cert to `android/app/src/main/res/raw/server_cert.pem`
4. Update `android-network-security-config.xml`
5. Update `config/runtime.ts` (fix typo + https/wss)
6. Update tests in `config/__tests__/runtime.test.ts`
7. Run `npx tsc --noEmit` to verify no type errors
8. Build a preview APK and verify connectivity on device

## Docs to Update

- `docs/ENV_CONFIG.md` — document cert paths and renewal schedule
- `docs/ARCHITECTURE.md` — note TLS on server transport
- `server/.env.example` — document cert file paths

## Security Properties After This Change

| Threat | Before | After |
|---|---|---|
| Passive sniffing on LAN | Exposed | Encrypted |
| MITM with rogue cert | Exposed | Rejected |
| MITM with bundled cert | N/A | Not possible (private key on server only) |
| Offline operation | Works | Works (cert check is local) |
| Dev build impact | None | None |

## Phase 0: Evolution to CA-Pinning (TLS Trust Migration)

**Status:** In development (feat/tls-trust-migration)

The self-signed approach above works but requires rebuilding and re-distributing the mobile app whenever the server certificate is rotated. Phase 0 migrates to a private CA model where:

- A private root CA (`server_ca.key`, `server_ca.pem`) is created once and kept offline
- Server leaf certificates are issued from that CA and can be rotated **without rebuilding the mobile app**
- The mobile app pins the CA certificate (not the leaf), so new leaves validate automatically

### CA Setup (one-time, offline)

**See:** `docs/deployment/runbooks.md` → [Offline CA Setup](../../deployment/runbooks.md#offline-ca-setup)

```bash
# On an offline machine
openssl req -x509 -newkey rsa:4096 -nodes -days 3650 \
  -keyout server_ca.key -out server_ca.pem \
  -subj "/CN=SAPOT LAN Root CA"
```

- `server_ca.key` stays offline in a physically secure location
- `server_ca.pem` is distributed to the mobile app as the new trust anchor

### Server Leaf Issuance

**See:** `docs/deployment/runbooks.md` → [TLS Certificate Rotation (CA-pinned server leaf)](../../deployment/runbooks.md#tls-certificate-rotation-ca-pinned-server-leaf)

```bash
# On the offline machine, issue a new leaf
openssl req -newkey rsa:2048 -nodes -keyout server.key -out server.csr \
  -subj "/CN=server.sapot.lan"
openssl x509 -req -in server.csr -CA server_ca.pem -CAkey server_ca.key \
  -CAcreateserial -days 825 \
  -extfile <(printf "subjectAltName=DNS:server.sapot.lan,IP:%s" "$SERVER_LAN_IP") \
  -out server.crt
```

The new `server.crt` and `server.key` are deployed to the server host; old app builds continue to work because they pin the CA, not the leaf.

### Migration Tasks

| Phase | Task | Description |
|-------|------|-------------|
| 0 | [Offline CA + leaf issuance docs](docs/deployment/runbooks.md) | Document CA setup and rotation procedures (this document) |
| 1 | Static CA-pin swap | Update `android-network-security-config.xml` to pin `server_ca.pem` instead of the leaf |
| 2 | Rotate prod server leaf | Re-issue current prod leaf from the CA (not described in this design doc) |

### Benefits Over Self-Signed Approach

| Scenario | Self-Signed (This Doc) | CA-Pinned (Phase 0+) |
|----------|---|---|
| Server cert rotation | Requires new app build/deploy | No app changes needed |
| CA rotation | N/A | Rare; requires new app build when CA nears expiry |
| Offline operation | Works (cert bundled) | Works (CA bundled) |
| Cert chain trust | Single cert | Issuer + leaf (standard PKI) |
| Revocation | Not supported | Not currently supported (could add CRL in future phases) |
