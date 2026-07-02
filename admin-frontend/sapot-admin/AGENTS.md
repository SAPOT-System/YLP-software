# AGENTS.md — admin-frontend/sapot-admin

Next.js 16 (App Router) admin/rescuer dashboard for SAPOT — maps, dashboards, and management views for the rescue team. See the root `AGENTS.md` for repo-wide conventions.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Development Workflow

- Package manager: npm (`package-lock.json`). Install: `npm install`.
- Dev server: `npm run dev` — sets `NODE_EXTRA_CA_CERTS` to trust the self-signed cert at `./certs/server.crt` so the app can talk to the server over HTTPS locally.
- `app/api/*` route handlers act as thin proxies to `server/` endpoints — keep new proxy routes thin (auth/forwarding only), don't add business logic on the client side of the proxy.

## Build

- `npm run build` — production Next.js build.
- `npm run start` — serve the production build.

## Test

No test framework is configured in this project (no test script in `package.json`, no Jest/Vitest config found). Don't invent a test command or claim test coverage that doesn't exist — flag this gap to the user if a task requires tests here.

## Lint / Format

- `npm run lint` — ESLint (`eslint.config.mjs`, flat config, `eslint-config-next`).
- No formatter (Prettier or otherwise) is configured — match surrounding style by hand.

## Framework Expectations

- Path alias `@/*` per `tsconfig.json` — use it instead of long relative imports.
- Styling: Tailwind CSS v4 (`postcss.config.mjs`, `tailwindcss`/`tailwind-merge`/`tailwind-scrollbar-hide`) — prefer utility classes over new CSS files.
- Client-side E2E crypto uses `tweetnacl`/`tweetnacl-util` — mirror the key-handling patterns already used in this project rather than the mobile app's (different crypto libraries: mobile uses `@noble/hashes` + `expo-crypto` in addition).
- Local persistence (chat cache, offline state) uses Dexie (IndexedDB) via `dexie`/`dexie-react-hooks`, not WatermelonDB (that's mobile-app only).

## Do Not Edit Manually

- `package-lock.json` — regenerate via `npm install`, don't hand-edit.
- `.next/` build output (gitignored) — never hand-edit generated build artifacts.

## Common Pitfalls

- Forgetting `NODE_EXTRA_CA_CERTS` when running the server outside `npm run dev` — API calls to `server/` will fail TLS verification against the self-signed cert.
- Adding business logic inside an `app/api/*` proxy route instead of keeping it a thin forwarder to the real `server/` endpoint.
- Assuming a test suite exists — it doesn't; verify manually or add one explicitly if the task calls for it.

## Validation Checklist

- [ ] `npm run build` succeeds
- [ ] `npm run lint` is clean
- [ ] Manually verified in the browser against a running `server/` instance (no automated test suite to fall back on)
- [ ] New Next.js 16 API usage checked against `node_modules/next/dist/docs/`, not assumed from prior Next.js versions
