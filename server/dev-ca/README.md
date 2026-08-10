This directory holds the **shared dev-only CA**. Unlike everything else
under this pattern (`*.pem`/`*.key`/`*.crt` are gitignored repo-wide),
`server_ca.pem` and `server_ca.key` here are **intentionally committed** —
see `../.gitignore`'s explicit exception — so the team can self-service
leaf issuance with just `git clone`, no separate key-distribution step.

Every leaf cert generated from this CA (self-signed-per-branch,
CA-signed-per-leaf — whatever) is only as trustworthy as this repo's
access control. Anyone with read access to the repository — now or in the
future, including forks and CI — has the CA private key, permanently
(removing it later means rewriting git history, not just deleting the
file). That trade was made deliberately because this is dev-only with no
production deployment; see the warning below.

## What's here

- `server_ca.pem` — the dev CA's public certificate
- `server_ca.key` — the dev CA's private key

## What this is for

If your mobile app build pins this CA (see
`../../docs/deployment/runbooks.md`, "Offline CA Setup"), a plain
self-signed cert won't be trusted by it. Dropping the CA files here lets
`docker/up.sh up --build` issue a CA-signed leaf for your machine's own
LAN IP automatically — `docker/gen-certs.sh` detects `server_ca.pem` +
`server_ca.key` and signs a leaf instead of self-signing. No files here →
falls back to a self-signed cert as before.

Override the mount location with `DEV_CA_DIR=/path/to/ca docker/up.sh up`
if you keep the CA files somewhere else on disk.

## Do not reuse this CA for production

This is a **development-only** convenience for a team where members run
the server independently on different networks. **Never use a CA
generated/shared this way for an actual production deployment** — production
leaf issuance follows the offline, air-gapped process in
`../../docs/deployment/runbooks.md` ("Offline CA Setup" /
"TLS certificate rotation") specifically so the CA private key never
touches a networked machine. If this project moves to production, generate
a fresh CA there — don't promote this one.
