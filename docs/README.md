# SAPOT — Documentation Index

> Browse this documentation as a website: run `pnpm start` inside `docs/site/`, or visit https://emman-pip.github.io/YLP-software/ once the GitHub Pages deploy is live.

SAPOT (Search and Patrol Operations Technology) is a LAN-first disaster-response communications platform. It provides messaging, voice/video calls, GPS tracking, and announcements over a local-area network (LAN) when internet connectivity is unavailable. All core functions — messaging, peer discovery, and calls — operate without an internet connection. The server coordinates authentication, sync, and signalling but does not relay chat messages.

---

## Components

| Name | Role | Primary Stack | Local Docs |
|---|---|---|---|
| `mobile-app/sapot-mobile-app/` | Android app — messaging, voice/video calls, GPS sharing, announcements, peer discovery | Expo, React Native, TypeScript, WatermelonDB, WebRTC | [mobile-app/sapot-mobile-app/docs/](../mobile-app/sapot-mobile-app/docs/) |
| `server/` | Backend — auth, sync, signalling relay, GPS, admin, GSM proxy, MikroTik telemetry | FastAPI, Python, MariaDB, Redis, Gunicorn | — |
| `admin-frontend/sapot-admin/` | Admin/rescuer dashboard — user management, GPS map, network analytics | Next.js App Router, TypeScript | — |
| `GSM-module/` | SMS gateway — sends SMS when LAN messaging fails | FastAPI, pyserial, Arduino/AT commands | — |
| `captive-portal/` | MikroTik hotspot login pages shown to users joining the network | Static HTML/CSS/JS | — |
| `tileserver/` | Offline map tile server for the GPS map | — | — |

---

## By Role

| Role | Start here |
|---|---|
| New developer / contributor | [getting-started/](getting-started/) |
| QA | [qa/README.md](qa/README.md) |
| DevOps | [devops/README.md](devops/README.md) |
| Architect | [architecture/](architecture/) and [adr/](adr/) |

---

## Documentation Index

### Architecture

| Document | Contents |
|---|---|
| [architecture/system-overview.md](architecture/system-overview.md) | Component responsibilities, system boundaries, communication matrix, roles |
| [architecture/assumptions-and-constraints.md](architecture/assumptions-and-constraints.md) | Consolidated deployment assumptions and technical constraints, with links to the ADRs/threat model they come from |
| [architecture/component-map.md](architecture/component-map.md) | Process/service topology, ports, deployment units, what talks to what |
| [architecture/data-flow.md](architecture/data-flow.md) | Sync flow, message delivery (WS relay, LAN P2P, SMS fallback), call signalling, GPS streaming — with Mermaid diagrams |
| [architecture/networking-lan-model.md](architecture/networking-lan-model.md) | LAN topology, MikroTik router role, mDNS discovery, client isolation considerations |
| [architecture/security-architecture.md](architecture/security-architecture.md) | Auth, password hashing, E2E encryption key hierarchy and flows, rate limiting, LAN transport security |
| [architecture/threat-model.md](architecture/threat-model.md) | Trust boundaries, in-scope attack surfaces, device theft / router compromise / insider threat scenarios, known risks |
| [adr/](adr/) | Architecture Decision Records — NaCl box, no server migration tooling, WatermelonDB, P2P calls, LAN-first design, roles model |

### Mobile App (Detailed)

These live inside the mobile app sub-project at `mobile-app/sapot-mobile-app/docs/`:

| Document | Contents |
|---|---|
| [ONBOARDING.md](../mobile-app/sapot-mobile-app/docs/ONBOARDING.md) | Developer onboarding — where complexity lives and how to navigate the codebase |
| [ARCHITECTURE.md](../mobile-app/sapot-mobile-app/docs/ARCHITECTURE.md) | Service map, DI containers, transport modes, encryption, adapters |
| [SYNC.md](../mobile-app/sapot-mobile-app/docs/SYNC.md) | Pull/push sync cycle, trigger points, entity list, field normalization |
| [API.md](../mobile-app/sapot-mobile-app/docs/API.md) | REST endpoint reference |
| [DATABASE.md](../mobile-app/sapot-mobile-app/docs/DATABASE.md) | WatermelonDB schema and migrations |
| [CALL_FLOW.md](../mobile-app/sapot-mobile-app/docs/CALL_FLOW.md) | Call lifecycle and message types |
| [LAN_MESSENGER.md](../mobile-app/sapot-mobile-app/docs/LAN_MESSENGER.md) | LAN-only messaging behaviour and constraints |
| [CONNECTION_MESSAGES.md](../mobile-app/sapot-mobile-app/docs/CONNECTION_MESSAGES.md) | WebSocket, TCP, and WebRTC data-channel message catalogue |
| [ENV_CONFIG.md](../mobile-app/sapot-mobile-app/docs/ENV_CONFIG.md) | Environment variables, build variants, secure-storage keys |
| [TESTING.md](../mobile-app/sapot-mobile-app/docs/TESTING.md) | Test utilities, mock patterns, conventions |
| [STATE_MANAGEMENT.md](../mobile-app/sapot-mobile-app/docs/STATE_MANAGEMENT.md) | The app's seven state mechanisms, sources of truth, debugging pain points |
| [system-boundaries.md](../mobile-app/sapot-mobile-app/docs/system-boundaries.md) | UI/hooks/service layer boundaries |
| [design-system.md](../mobile-app/sapot-mobile-app/docs/design-system.md) | Material Design 3 theming via `react-native-paper` |
| [conventions.md](../mobile-app/sapot-mobile-app/docs/conventions.md) | Code style and TypeScript conventions |
| [READABILITY_AUDIT.md](../mobile-app/sapot-mobile-app/docs/READABILITY_AUDIT.md) | Codebase readability/maintainability audit |
| [adr/](../mobile-app/sapot-mobile-app/docs/adr/) | Mobile-specific Architecture Decision Records (WebRTC reconnect/rebuild behaviour) |
| [diagrams/](../mobile-app/sapot-mobile-app/docs/diagrams/) | Mermaid sequence diagrams for startup, LAN messaging, calls, GPS, SMS, guest user, security, encryption |
| [audits/](../mobile-app/sapot-mobile-app/docs/audits/) | QA test cases, regression suite, automation plan |

### CI/CD

| Document | Contents |
|---|---|
| [EXPO_ANDROID_CI_DOCUMENTATION.md](../.github/workflows/EXPO_ANDROID_CI_DOCUMENTATION.md) | Expo Android CI/CD workflow |

### Getting Started

| Document | Contents |
|---|---|
| [getting-started/overview.md](getting-started/overview.md) | Component map and setup order |
| [getting-started/quickstart.md](getting-started/quickstart.md) | Full-stack "clone → run everything" happy path |
| [getting-started/server-docker-setup.md](getting-started/server-docker-setup.md) | Run the FastAPI server via Docker Compose (recommended) |
| [getting-started/server-setup.md](getting-started/server-setup.md) | Run the FastAPI server bare-metal (no Docker) |
| [getting-started/mobile-app-setup.md](getting-started/mobile-app-setup.md) | Nix + Expo dev environment setup |
| [getting-started/gsm-module-setup.md](getting-started/gsm-module-setup.md) | SMS gateway setup |
| [getting-started/admin-frontend-setup.md](getting-started/admin-frontend-setup.md) | Next.js admin dashboard setup |

### API

| Document | Contents |
|---|---|
| [api/README.md](api/README.md) | How to discover the live API base URL and spec (`/docs`, `/redoc`, `/openapi.json`) |
| [api/conventions.md](api/conventions.md) | Shared API conventions (auth, errors, rate limits) |
| [api/openapi/](api/openapi/) | Committed OpenAPI YAML fragments per feature, generated from the live server |

### Database

| Document | Contents |
|---|---|
| [database/erd.md](database/erd.md) | Entity-relationship diagram (Mermaid) |
| [database/schema-overview.md](database/schema-overview.md) | Server (SQLModel) and mobile (WatermelonDB) schema overview |
| [database/tables.md](database/tables.md) | Full column reference, server and mobile |
| [database/migrations.md](database/migrations.md) | Server (no tooling) and mobile (WatermelonDB `schemaMigrations`) migration strategy |

### Deployment

| Document | Contents |
|---|---|
| [deployment/overview.md](deployment/overview.md) | Deployment topology and component overview |
| [deployment/server.md](deployment/server.md) | FastAPI server deployment |
| [deployment/environment-config.md](deployment/environment-config.md) | Environment variables for every component |
| [deployment/secrets-management.md](deployment/secrets-management.md) | Secret storage and rotation |
| [deployment/monitoring-logging.md](deployment/monitoring-logging.md) | Monitoring and logging setup |
| [deployment/runbooks.md](deployment/runbooks.md) | Backup/restore, manual DB DDL application, TLS rotation, rollback, disaster recovery |
| [deployment/incident-response.md](deployment/incident-response.md) | Severity levels, roles, and communication process during a live incident |
| [deployment/maintenance.md](deployment/maintenance.md) | Recurring backup/cert/log/dependency upkeep schedule |
| [deployment/mobile-eas.md](deployment/mobile-eas.md) | Mobile app EAS build/deploy |
| [deployment/admin-frontend.md](deployment/admin-frontend.md) | Admin dashboard deployment |
| [deployment/gsm-module.md](deployment/gsm-module.md) | GSM module deployment |
| [deployment/tileserver.md](deployment/tileserver.md) | Offline tileserver deployment |

### Features

Per-feature design/requirements/testing docs live under `features/<name>/`, each with a `README.md` summary: [account-recovery](features/account-recovery/README.md), [admin-management](features/admin-management/README.md), [authentication](features/authentication/README.md), [calls](features/calls/README.md), [e2e-encryption](features/e2e-encryption/README.md), [gps](features/gps/README.md), [messaging](features/messaging/README.md), [sms-gateway](features/sms-gateway/README.md), [sync](features/sync/README.md).

---

## Troubleshooting

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for common setup and connectivity failures across all components.

## Glossary

See [GLOSSARY.md](GLOSSARY.md) for definitions of SAPOT-specific terms (roles, LAN, signalling, sync, etc.).

---

## Root-Level Documents

| Document | Contents |
|---|---|
| [../README.org](../README.org) | Repository overview and deliverables |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | Branching, commit conventions, and PR workflow |
| [../SECURITY.md](../SECURITY.md) | Vulnerability disclosure process and known security posture |
| [../LICENSE](../LICENSE) | MIT license |
| [../VERSIONING.md](../VERSIONING.md) | Git-tag-driven versioning and release process (mobile/server independent) |
| [../CHANGELOG.md](../CHANGELOG.md) | Notable changes per release |
| [docs-todo.md](docs-todo.md) | Documentation audit remediation tracker |
| [mobile-app-todo.org](mobile-app-todo.org) | Mobile app feature brief and TODOs |

---

## Known Gap

Physical deployment steps — MikroTik router configuration for a real site, APK distribution to rescuer devices, onboarding rescuers at an incident site — are not yet documented. See [devops/README.md](devops/README.md) and [qa/README.md](qa/README.md) for what *is* covered for those workflows.
