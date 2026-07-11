# CLAUDE.md — admin-frontend/sapot-admin

Instructions for Claude Code working in the SAPOT admin/rescuer dashboard. See root `../../CLAUDE.md` for repo-wide rules; this file is project-specific.

**Note on `AGENTS.md` in this directory:** it claims "this is NOT the Next.js you know" and instructs reading `node_modules/next/dist/docs/` before writing Next.js code. That directory does not exist in a standard Next.js install and no such convention is used elsewhere in this repo — treat that file's claim with skepticism rather than as verified guidance. This app runs an ordinary Next.js 16 App Router setup.

## Project Overview

Next.js 16 (App Router) / React 19 / TypeScript admin dashboard for rescuers/admins: user management, live GPS map, network analytics, chat/messages, announcements, and an SMS-gateway (GSM) control page. Acts as a browser-based counterpart to the mobile app, sharing the same backend and much of the same client-side data model (Dexie mirrors the mobile app's WatermelonDB schema; the same NaCl E2E crypto scheme is reused).

Stack: Next.js 16, React 19, TypeScript, Tailwind CSS v4, Dexie (IndexedDB), Zustand, `maplibre-gl`, `recharts`, `tweetnacl`.

## Architecture

**Backend-for-frontend (BFF) proxy pattern.** The browser never calls the FastAPI backend directly. Every `app/api/*/route.ts` is a thin Next.js Route Handler that calls `secureFetch()` (`api/fetch.ts`, `'use server'`) and re-wraps the response with `NextResponse.json(...)`. `secureFetch` reads `access_token`/`refresh_token` cookies, calls `${API_DOMAIN}${endpoint}` with `Authorization: Bearer`, and on `401` attempts `POST ${API_DOMAIN}/auth/refresh`, resetting cookies. This keeps the backend's TLS cert/CORS concerns server-side only (see the `dev` script's `NODE_EXTRA_CA_CERTS` — the backend is HTTPS-first even in dev).

**Auth gating happens twice, cookie-presence only:**
- `middleware.ts` (edge) — redirects unauthenticated users away from protected paths; redirects authenticated users away from the login page.
- `app/(dashboard)/layout.tsx` (server component) — reads the `access_token` cookie via `cookies()`, redirects to `/` if missing.

Neither validates the token's signature or expiry — actual verification is per-request, server-side, in `secureFetch`'s 401→refresh flow. Don't assume the middleware/layout checks are a security boundary beyond UX.

**Offline/local data.** `lib/db.ts` defines a Dexie (`chat-db`) database mirroring the mobile app's WatermelonDB tables: `peers, guest_user, conversations, conversation_participants, messages, message_receipts, calls, call_participants`. `lib/sync/syncEngine.ts` implements pull/push sync against `/api/sync/pull` and `/api/sync/push`, using `lib/sync/mutationQueue.ts` (local mutation queue) and `lib/sync/storage.ts` (`lastPulledAt` cursor). `lib/sync/collectChanges.ts` also exports `clearSessionData()`, which wipes all Dexie tables and the sync cursor on login/logout.

**Chat UI state** is separate from persistence: `chatstore/Chatstore.ts` is a Zustand store (`useChatStore`) holding only in-memory `conversations`/`messages` for the UI — the source of truth is Dexie via the sync engine, not this store.

**Real-time / crypto.** `lib/ws/client.ts` is a WebSocket client for live chat/call events. `lib/adminEncryption.ts` implements the same NaCl-box E2E scheme as the mobile app (see `../../mobile-app/sapot-mobile-app/CLAUDE.md` → Encryption, and ADR 0001) — do not implement a second crypto scheme here.

## Directory Guide

- `app/` — App Router pages (route groups `(dashboard)`/`(protected)`) and `app/api/*` Route Handlers (the BFF proxy layer). Protected pages: `dashboard`, `analytics`, `users`, `nodes`, `logs`, `gsm`, `announcements`, `messages`, `settings`.
- `actions/` — Next.js Server Actions (`'use server'`), e.g. `actions/auth.ts` (`loginAction`, `logout`).
- `chatstore/` — Zustand store for in-memory chat UI state only (not persistence).
- `lib/` — `db.ts` (Dexie schema/client), `sync/` (offline pull/push sync engine), `ws/` (WebSocket client), `adminEncryption.ts` (E2E crypto), `actions/` (server-action data helpers), `AuthGuard.ts` (client `useAuthGuard` hook).
- `ui/` — presentational components: `ui/dashboard/*` (nav-bar, side-bar, tables, charts, speedometer, skeleton loaders), `ui/components/MapLibre.tsx` (GPS map), `ui/login/loginpage.tsx`. No component-library dependency (no Radix/shadcn/MUI) — everything here is hand-rolled against Tailwind.
- `middleware.ts` — edge-level cookie-presence route gate.

## Key Concepts

- **BFF proxy, not a typed API client.** There is no generated/typed SDK — every route handler and `lib/actions/*` call is a plain untyped `fetch`/`any`. When adding a new backend call, follow the existing `secureFetch()` pattern rather than introducing a different HTTP client.
- **Dual local-state model:** Dexie = durable client-side data (survives reload, drives sync), Zustand `chatstore` = ephemeral UI state. Don't put durable data in the Zustand store or UI-only state in Dexie.
- **Two auth checks, one real enforcement point.** Cookie presence is checked client-adjacent (middleware, layout) for UX/redirect purposes; the backend is the actual authority, enforced through `secureFetch`'s refresh flow.

## Development Conventions

- Route handlers (`app/api/*/route.ts`) should stay thin — call `secureFetch` and shape the response; put actual logic in `lib/` or `actions/`, not in `route.ts`.
- Match the existing Tailwind + hand-rolled component style in `ui/dashboard/` — don't introduce a component library.
- **`next.config.ts` sets `typescript.ignoreBuildErrors: true` and `eslint.ignoreDuringBuilds: true`** — `pnpm run build` succeeding does **not** mean types or lint are clean. Always run `pnpm run lint` and check types explicitly; don't rely on a successful build as a correctness signal.
- New backend calls: add a `lib/actions/*` helper or `app/api/*/route.ts` following the `secureFetch()` pattern, matching `../../docs/api/conventions.md` for response/error shape.

## Important Files

- `api/fetch.ts` — `secureFetch()`, the single chokepoint for backend calls (auth headers, 401→refresh).
- `middleware.ts` — edge auth gate; `config.matcher` must stay in sync with the protected-paths list.
- `actions/auth.ts` — server-action login/logout (see Common Pitfalls — there's a second, divergent login implementation).
- `lib/db.ts` — Dexie schema; must track the mobile app's WatermelonDB schema.
- `lib/sync/syncEngine.ts` — pull/push sync engine.
- `lib/adminEncryption.ts` — E2E crypto, mirrors mobile app's scheme.

## Common Pitfalls

- **Two divergent login implementations exist:** `actions/auth.ts`'s `loginAction` regex-parses the raw `Set-Cookie` header from the backend response and sets cookies manually; `api/login.ts` has a *second* `loginAction` that instead expects a JSON body (`data.access_token`) and also calls `db.open()`/`sync()`. Before changing login behavior, determine which one the login form actually calls — do not assume `actions/auth.ts` is canonical just because it's named more conventionally.
- **`logout()` in `actions/auth.ts` deletes a cookie named `'auth_token'`**, but login sets `'access_token'`/`'refresh_token'` — this mismatch means logout likely does not clear the session cookie it thinks it does. Verify before relying on or "fixing" this without checking actual cookie names in use.
- **Duplicate `collectChanges` logic** exists in `lib/sync/collectChanges.ts` and again inline inside `lib/sync/syncEngine.ts`, and they are not identical — changing sync behavior in one without the other will cause drift.
- **`lib/ws/client.ts` hardcodes `ws://localhost:8000/ws`** — doesn't read `API_DOMAIN`, doesn't use `wss://`. Don't assume this works against any non-localhost/non-dev backend without checking this file first. It also has an unused, typo'd `handleCall` alongside the real `handleCallEvent` — don't confuse the two.
- **Inconsistent `API_DOMAIN` fallback:** `api/fetch.ts` falls back to `https://127.0.0.1:8000`, `api/login.ts` falls back to `https://localhost:8000`. Don't assume both files agree on the default backend URL.
- **Build success is not a correctness signal** — see Development Conventions; `ignoreBuildErrors`/`ignoreDuringBuilds` are set.

## When Modifying This Project

- Any change to `lib/db.ts`'s Dexie schema must be checked against the mobile app's WatermelonDB schema (`../../mobile-app/sapot-mobile-app/features/shared/database/schema.ts`) and `../../docs/database/tables.md` — these two client schemas are expected to represent the same server data model.
- Login/logout changes: reconcile `actions/auth.ts` and `api/login.ts` rather than editing just one (see Common Pitfalls).
- Sync engine changes: update both `lib/sync/collectChanges.ts` and the inline copy in `lib/sync/syncEngine.ts`, or consolidate them as part of the change.
- Real-time/WS changes: check `lib/ws/client.ts`'s hardcoded URL and `handleCall`/`handleCallEvent` naming before assuming existing behavior is correct.
