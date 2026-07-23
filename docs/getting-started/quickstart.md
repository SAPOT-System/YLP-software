# Quickstart: Run the Whole Stack Locally

The fastest path from a fresh clone to a working end-to-end setup (server + mobile app on a phone/emulator on the same LAN). For deeper detail on any single component, see the per-component setup guides linked at each step.

This quickstart covers the **minimum golden path**: server + mobile app. GSM/SMS fallback and the admin frontend are optional add-ons, covered at the end.

---

## 1. Prerequisites checklist

- Docker + Docker Compose v2, Node ≥ 18, npm 10.8.2
- Android device or emulator, on the **same Wi-Fi network** as the machine running the server
- [Nix](https://nixos.org/) (used to pin the mobile app's dev toolchain)

## 2. Start the server

```bash
cd server
cp .env.docker.example .env    # edit placeholder secrets before anything but local dev
docker/up.sh up --build -d
```

This brings up MariaDB, Redis, the API, and an Nginx TLS terminator together — no local MariaDB/Redis install, and no manual cert setup — and auto-detects this machine's LAN IP for the dev TLS certificate's SAN.

**Checkpoint:** `curl -sk https://<your-lan-ip>/version` (or `https://localhost/version` from the same machine) returns a JSON version payload. If not, see [Troubleshooting: server won't start](../TROUBLESHOOTING.md#server-wont-start-or-crashes-on-import).

Full detail: [server-docker-setup.md](server-docker-setup.md). Prefer to run the API directly without Docker? See [server-setup.md](server-setup.md) (bare-metal, requires installing MariaDB/Redis yourself).

## 3. Start the mobile app

```bash
# from mobile-app/
bash configure_nix.sh
nix develop -L
cd sapot-mobile-app
npm install
```

Point the app at your server's LAN IP:

```bash
# mobile-app/sapot-mobile-app/.env.local
EXPO_PUBLIC_DEV_HOST=192.168.1.x   # same host from step 2
```

```bash
npm run dev
```

Open the app on your device/emulator (same Wi-Fi network as the server), go to the getting-started screen, tap **Server Mode**, and enter the same LAN IP in settings.

**Checkpoint:** the app's login/registration screen loads without a network error. If it hangs or errors, see [Troubleshooting: mobile app can't reach the server](../TROUBLESHOOTING.md#mobile-app-cant-reach-the-server).

Full detail: [mobile-app-setup.md](mobile-app-setup.md).

## 4. Register a user and verify end-to-end messaging

1. Register a new account in the app (or use **Guest Mode** to skip registration entirely — no server dependency for LAN messaging).
2. Repeat steps 3–4 on a second device on the same LAN.
3. Discover the peer (automatic via mDNS on the same network) and send a message.

**Checkpoint:** the message appears on the recipient device. This confirms LAN peer discovery, transport (WebRTC data channel or LAN TCP+TLS), and E2E encryption are all working together.

## 5. Optional: GSM/SMS fallback

Only needed if testing SMS delivery to devices off the LAN. See [gsm-module-setup.md](gsm-module-setup.md) — requires a serial-attached GSM modem and a shared `GSM_SECRET` matching the server's.

## 6. Optional: Admin frontend

Only needed for dashboard work (user management, live GPS map, announcements). See [admin-frontend-setup.md](admin-frontend-setup.md) — requires `API_DOMAIN` pointed at the same server from step 2.

---

## Next steps

- [architecture/system-overview.md](../architecture/system-overview.md) — how the pieces fit together
- [TROUBLESHOOTING.md](../TROUBLESHOOTING.md) — common setup failures and fixes
- [environment-config.md](../deployment/environment-config.md) — full environment variable reference
