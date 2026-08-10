# SAPOT Postman collection

A runnable collection of the server's HTTP API, for exercising endpoints directly
without going through the mobile app or admin frontend. Complements
[`docs/api/openapi/`](../docs/api/openapi/) (drift-checked in CI) rather than
duplicating it — most of this collection is generated from it.

## Contents

- `collections/*.postman_collection.json` — 12 generated collections, one per
  fragment in `docs/api/openapi/` (admin, auth-and-recovery, gps, sync, etc.).
  Every request carries a baseline test (no 5xx, response time under 5s, and a
  conditional JSON-body check).
- `flows/*.postman_collection.json` — 3 hand-authored smoke flows
  (`authentication`, `sync`, `admin`) that seed known fixtures and assert exact
  request/response behavior, not just "didn't crash".
- `environments/local-docker.postman_environment.json` — target the local Docker
  stack (`https://localhost`, per `docs/getting-started/docker-setup.md`).
- `environments/lan-server.postman_environment.json` — target a deployed LAN
  server (`https://server.sapot.lan`).
- `package.json` — pins the `newman` version used locally and in CI.

Both environments define two variables only: `baseUrl` and `token`. Neither ships
with a real value — `token` is blank and marked `secret` so Postman masks it.
**No credentials are committed.**

## Import

1. Postman → **Import** → select the `collections/` directory (Postman accepts
   a folder import), the `flows/` directory, and both files under
   `environments/`.
2. Pick the environment matching your target (top-right environment selector).

## Running locally

```
docker compose -f docker-compose.yml -f docker-compose.ci.yml \
  up -d --wait --build api nginx

scripts/run-postman-tests.sh          # full: 12 collections + 3 flows
scripts/run-postman-tests.sh smoke    # flows only
```

The script handles the reset/seed/token-mint sequence itself, so there's no
manual token copy step for a scripted run — reset the database, seed the
`roles` fixture scenario, mint a real `qa_admin` access token, then run newman
over the selected suite. Tear down with:

```
docker compose -f docker-compose.yml -f docker-compose.ci.yml down -v
```

## Suites

- `smoke` — `flows/` only. Fast: 3 flows, ~26 requests.
- `full` — the 12 generated collections plus the 3 flows. This is the default
  for a local run with no argument. ~121 + 26 requests.

**CI policy:** PRs and pushes targeting `develop` run `smoke`; targeting `main`
runs `full`. The consequence: the 121-endpoint no-5xx sweep is effectively a
release-time check on `main`, not a per-PR check on `develop` — a regression in
an endpoint with no flow coverage surfaces later than it otherwise would. This
was a deliberate tradeoff (rejected a 12-way job matrix; a single Compose boot
is ~4 minutes, and 12 of those per PR was not worth the extra minutes for
per-PR coverage of endpoints nothing else exercises). Anyone adding an endpoint
they want covered on every `develop` PR should add or extend a flow under
`flows/`, not rely on the generated collections running there.

## TLS

`docker/gen-certs.sh` issues nginx's leaf certificate signed by the committed
dev CA (`server/dev-ca/server_ca.pem`) with `CN=localhost`, so verification can
genuinely succeed rather than being skipped:

```
NODE_EXTRA_CA_CERTS=$PWD/server/dev-ca/server_ca.pem \
  postman/node_modules/.bin/newman run postman/flows/authentication.postman_collection.json \
  --env-var baseUrl=https://localhost \
  --env-var qaToken=<your QA_API_TOKEN>
```

`scripts/run-postman-tests.sh` sets `NODE_EXTRA_CA_CERTS` for you. `--insecure`
is a fallback for a target whose certificate isn't signed by this dev CA — for
example a LAN server issued a plain self-signed cert — not the default path.

## Getting a token

For interactive use in the Postman app, the collection sets a collection-level
Bearer auth using `{{token}}`, inherited by every request unless a
folder/request overrides it. To populate it:

1. Run the **authentication → Login For Access Token** request (`POST
   /auth/token`) with valid credentials for your target server.
2. Copy `access_token` from the response into the environment's `token`
   variable.

For local/CI scripting against `ENVIRONMENT=development`, `/testing/login-as/{handle}`
is faster — mints a token directly for a known QA fixture handle (`qa_admin`,
`qa_baseline`, `admin`, etc.), given the `X-QA-Token` header matching
`QA_API_TOKEN`. This is what `scripts/run-postman-tests.sh` and every flow use
internally; see `server/app/api/testing.py` for the full fixture list.

Endpoints that don't require auth (e.g. `/auth/`, `/auth/token` itself) work
without this.

## Assertions

Generated collections (`collections/`) carry a baseline test injected by the
generator: no 5xx, response time under 5s, and — only when the response
actually claims `application/json` — a parseable JSON body. This is
deliberately lenient: `openapi-to-postmanv2` fakes request bodies from the
OpenAPI schema, so a large share of POST/PATCH/DELETE requests legitimately
4xx on faked input. The value here is catching unhandled exceptions and hangs
across all 121 endpoints, not asserting correct behavior.

Exact-behavior assertions (specific response shapes, authorization boundaries,
pagination correctness) live in the hand-authored flows under `flows/`.

## CI

`.github/workflows/postman-tests.yml` boots the Compose stack (including the
`docker-compose.ci.yml` overlay) inside the runner and runs the suite selected
by target branch — see Suites above. Path-filtered to `server/**`,
`postman/**`, `docker/**`, and the scripts/workflow files themselves, so it
doesn't run on a mobile-app-only or docs-only PR.

## Regenerating

`collections/` is generated from `docs/api/openapi/*.yaml`, not hand-authored,
so it can be refreshed whenever the spec changes rather than drifting:

```
ruby scripts/generate_postman_collection.rb
```

Requires Ruby (stdlib only) and Node (`npx`, to run `openapi-to-postmanv2`).
The script merges the 12 OpenAPI fragments (tagging each operation with its
fragment name so requests land in matching folders), converts the result with
`openapi-to-postmanv2`, strips the per-item auth blocks the converter emits
(so every request inherits the collection-level bearer auth rather than a
dead per-operation scheme), attaches the baseline test to every request,
rewrites Postman's random `id`/`_postman_id` fields with deterministic ones
derived from each item's path/name, then splits the result into the 12 files
under `collections/`. It never touches `flows/`.

Regenerating **is not fully diff-silent**: `openapi-to-postmanv2` fakes example
values (request bodies, some query params) from the schema on every run, and
that faking isn't seedable from the CLI, so example values may shift even when
the API shape hasn't. Folder structure, request names, methods, URLs, and IDs
stay stable — review a regenerated diff with that in mind.

## Constraints (keep these true when editing)

- No secrets in any collection, flow, or environment file — variables only.
- `collections/` is generated — hand-edits are silently overwritten by the
  next regeneration. Change `scripts/generate_postman_collection.rb` instead.
- `flows/` is hand-authored — the generator must never write there.
- Environment files keep `token` blank; it's supplied at runtime
  (`--env-var token=...`, or by a flow's own login step).
