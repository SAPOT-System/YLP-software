# SAPOT Postman collection

A runnable collection of the server's HTTP API, for exercising endpoints directly
without going through the mobile app or admin frontend. Complements
[`docs/api/openapi/`](../docs/api/openapi/) (drift-checked in CI) rather than
duplicating it — this collection is generated from it.

## Contents

- `sapot-api.postman_collection.json` — the collection, grouped into folders that
  match the groupings in `docs/api/openapi/` (admin, auth, gps, sync, etc.).
- `environments/local-docker.postman_environment.json` — target the local Docker
  stack (`https://localhost`, per `docs/getting-started/docker-setup.md`).
- `environments/lan-server.postman_environment.json` — target a deployed LAN
  server (`https://server.sapot.lan`).

Both environments define two variables only: `baseUrl` and `token`. Neither ships
with a real value — `token` is blank and marked `secret` so Postman masks it.
**No credentials are committed.**

## Import

1. Postman → **Import** → select `sapot-api.postman_collection.json` and both
   files under `environments/`.
2. Pick the environment matching your target (top-right environment selector).
3. If your target uses a self-signed cert (local Docker, per
   `docker-setup.md`), disable SSL certificate verification for that request/
   environment in Postman's settings, or install the dev CA — otherwise
   requests will fail TLS verification.

## Running with newman (CLI)

```
newman run postman/sapot-api.postman_collection.json \
  -e postman/environments/local-docker.postman_environment.json \
  --insecure
```

Both environments target self-signed certs (`https://localhost` for local
Docker, `https://server.sapot.lan` for the LAN server), so newman fails with
`unable to verify the first certificate` unless TLS verification is relaxed:

- `--insecure` (or `-k`) skips certificate verification for the run —
  simplest option for these known dev/LAN certs.
- Alternatively, set `NODE_EXTRA_CA_CERTS=/path/to/dev-ca.pem` (dev CA per
  `docker-setup.md`) before running newman to verify against the real chain
  instead of disabling verification.

## Getting a token

The collection sets a collection-level Bearer auth using `{{token}}`, inherited
by every request unless a folder/request overrides it. To populate it:

1. Run the **authentication → Login For Access Token** request (`POST
   /auth/token`) with valid credentials for your target server.
2. Copy `access_token` from the response into the environment's `token`
   variable.

Endpoints that don't require auth (e.g. `/ping`, `/auth/token` itself) work
without this.

## Regenerating

The collection is generated from `docs/api/openapi/*.yaml`, not hand-authored,
so it can be refreshed whenever the spec changes rather than drifting:

```
ruby scripts/generate_postman_collection.rb
```

Requires Ruby (stdlib only) and Node (`npx`, to run `openapi-to-postmanv2`).
The script merges the 12 OpenAPI fragments (tagging each operation with its
fragment name so requests land in matching folders), converts the result with
`openapi-to-postmanv2`, then rewrites Postman's random `id`/`_postman_id`
fields with deterministic ones derived from each item's path/name — so
re-running it when the spec hasn't changed produces a byte-identical diff
instead of churning every ID.

Regenerating **is not fully diff-silent**: `openapi-to-postmanv2` fakes example
values (request bodies, some query params) from the schema on every run, and
that faking isn't seedable from the CLI, so example values may shift even when
the API shape hasn't. Folder structure, request names, methods, URLs, and IDs
stay stable — review a regenerated diff with that in mind.

## Constraints (keep these true when editing)

- No secrets in the collection or environment files — variables only.
- Regenerate rather than hand-edit `sapot-api.postman_collection.json` when the
  API changes; hand-edits will be overwritten by the next regeneration.
