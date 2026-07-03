# Disaster-Scenario Operating Constraints

SAPOT is designed to be deployed at a disaster/incident site rather than a data center (see [ADR 0005: LAN-first design](../adr/0005-lan-first-design.md)). This doc consolidates the assumptions and limits that follow from that decision — previously scattered across the LAN-first ADR and the disaster-recovery runbook — into one place. It doesn't introduce new capabilities; it states, in one spot, what the system assumes about the environment it runs in.

---

## Power

- No component has a battery-backup or UPS requirement built in. The server (laptop or SBC), MikroTik router, and GSM module's Arduino/modem all depend on external power (mains, generator, or their own battery) for as long as they're expected to stay up.
- A power loss to the server host is operationally identical to the hardware-failure case in [runbooks.md — Disaster recovery](runbooks.md#disaster-recovery-server-hardware-fails-at-incident-site): server-dependent features (auth, sync, GPS streaming, admin, SMS) go down; LAN P2P messaging/calls between already-paired mobile devices continue as long as the router and phones stay powered.
- A power loss to the MikroTik router takes down the LAN entirely (Wi-Fi AP, DHCP, captive portal) — there is no fallback network path. Mobile devices already on a shared local network segment without the router (e.g. a phone hotspot) are outside SAPOT's supported topology.
- Mobile devices depend on their own battery; SAPOT does not track or alert on device battery state.

## Connectivity

- **No internet dependency for the golden path** (messaging, peer discovery, calls, GPS sharing, offline map tiles, authentication) — see [ADR 0005](../adr/0005-lan-first-design.md#decision).
- **Internet is required only for:** Sentry error reporting from the mobile app, EAS build/OTA distribution, and external email delivery for OTP (see [networking-lan-model.md — Internet independence](../architecture/networking-lan-model.md#internet-independence)). None of these being unavailable blocks core incident-response function.
- **Cross-site communication is out of scope.** SAPOT assumes all active participants share one LAN; a rescuer at one incident site cannot message a rescuer at a different, unconnected site through SAPOT. The GSM/SMS fallback is the only bridge to a participant who is off the LAN entirely, and it still requires that participant's phone number and cellular reachability.

## Degraded modes

The system does not have a single "degraded mode" — different failures degrade different capabilities independently:

| Failure | What continues | What breaks |
|---|---|---|
| Server host down (power/hardware) | LAN P2P messaging & calls between devices already on the LAN | New logins/registration, cross-device sync, GPS streaming to rescuers, announcements, admin operations, SMS fallback |
| Router down (power/hardware) | Nothing — no LAN, no Wi-Fi, no device-to-device path | Everything |
| GSM module / modem down | Everything except SMS | SMS fallback to off-LAN participants |
| Internet down (LAN intact) | Everything except the internet-only conveniences listed above | Sentry reporting, OTA updates, OTP email delivery |

See [runbooks.md — Disaster recovery](runbooks.md#disaster-recovery-server-hardware-fails-at-incident-site) for the recovery procedure when the server host itself fails.

## Scale and range assumptions

SAPOT has no hardcoded ceiling on concurrent users or messages — capacity is bounded by the deployed hardware (server CPU/RAM, MariaDB connection limits, MikroTik router's Wi-Fi client and DHCP-lease capacity) and by Wi-Fi radio range from the MikroTik AP, which varies with the specific router/antenna and site conditions (walls, terrain, interference) rather than a fixed number. Because these depend entirely on the hardware and site chosen for a given deployment, treat them as a per-deployment sizing exercise (validate the router's rated concurrent-client count and do a walk test for radio coverage) rather than a fixed spec of the software.

---

*Consolidates context previously split across [ADR 0005](../adr/0005-lan-first-design.md) and [runbooks.md](runbooks.md); see [system-overview.md](../architecture/system-overview.md#system-boundaries) for the accompanying trust/data-flow boundaries.*
