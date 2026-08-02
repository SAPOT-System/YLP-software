#!/usr/bin/env bash
set -euo pipefail

# Runs the Postman suite against an already-running stack, in the order the
# fixtures require. Used by .github/workflows/postman-tests.yml and runnable
# locally for parity:
#
#   docker compose -f docker-compose.yml -f docker-compose.ci.yml up -d --wait api nginx
#   scripts/run-postman-tests.sh [smoke|full]
#
# Suites:
#   smoke  postman/flows/ only -- the three hand-authored scenario flows.
#          What CI runs for `develop`.
#   full   the 12 generated collections plus the flows. What CI runs for
#          `main`, and the default here so a local run checks everything.
#
# Reads QA_API_TOKEN from the environment, falling back to server/.env so a
# local run needs no extra setup. Writes one JUnit XML per collection into
# reports/ and exits non-zero if any run failed.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

SUITE="${1:-${SUITE:-full}}"

# Reject an unknown suite rather than defaulting. A typo that quietly runs
# nothing and exits 0 is the worst possible failure mode for a CI gate.
if [ "$SUITE" != "smoke" ] && [ "$SUITE" != "full" ]; then
    echo "Unknown suite '$SUITE'. Expected 'smoke' or 'full'." >&2
    exit 2
fi

BASE_URL="${BASE_URL:-https://localhost}"
ENVIRONMENT_FILE="${ENVIRONMENT_FILE:-postman/environments/local-docker.postman_environment.json}"
CA_CERT="$REPO_ROOT/server/dev-ca/server_ca.pem"
REPORT_DIR="$REPO_ROOT/reports"
NEWMAN="$REPO_ROOT/postman/node_modules/.bin/newman"

if [ ! -x "$NEWMAN" ]; then
    echo "newman not installed. Run: (cd postman && pnpm install)" >&2
    exit 1
fi

if [ -z "${QA_API_TOKEN:-}" ] && [ -f server/.env ]; then
    QA_API_TOKEN="$(grep -E '^QA_API_TOKEN=' server/.env | head -1 | cut -d= -f2- || true)"
fi

if [ -z "${QA_API_TOKEN:-}" ]; then
    echo "QA_API_TOKEN is not set and not present in server/.env" >&2
    exit 1
fi

rm -rf "$REPORT_DIR"
mkdir -p "$REPORT_DIR"

# TLS is verified for real against the committed dev CA. gen-certs.sh issues a
# leaf signed by that CA with CN=localhost, so --insecure is unnecessary.
export NODE_EXTRA_CA_CERTS="$CA_CERT"

# The minted token and QA_API_TOKEN are passed as newman argv (below), visible
# via /proc to any local user for the run's duration -- an accepted tradeoff on
# an ephemeral CI runner, and preferable to writing a secret to disk on a local
# run, but worth knowing on a shared machine.

qa_post() {
    curl --fail --silent --show-error \
        --cacert "$CA_CERT" \
        -X POST \
        -H "X-QA-Token: $QA_API_TOKEN" \
        "$BASE_URL$1"
}

echo "==> Suite: $SUITE"

failed=0

run_collection() {
    local path="$1"
    local label="$2"
    shift 2

    echo "==> newman: $label"
    if ! "$NEWMAN" run "$path" \
        -e "$ENVIRONMENT_FILE" \
        --env-var "baseUrl=$BASE_URL" \
        --reporters cli,junit \
        --reporter-junit-export "$REPORT_DIR/$label.xml" \
        "$@"; then
        echo "FAILED: $label" >&2
        failed=1
    fi
}

# Generated collections run only in the full suite. They need a seeded database
# and a shared admin token, so that preamble lives here rather than at the top:
# a smoke run is self-contained and shouldn't pay for it.
if [ "$SUITE" = "full" ]; then
    echo "==> Resetting database"
    qa_post /testing/reset > /dev/null

    echo "==> Seeding 'roles' scenario"
    qa_post /testing/seed/roles > /dev/null

    echo "==> Minting an access token for the qa_admin fixture"
    TOKEN="$(qa_post /testing/login-as/qa_admin | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')"

    if [ -z "$TOKEN" ]; then
        echo "Failed to mint a token from /testing/login-as/qa_admin" >&2
        exit 1
    fi

    if compgen -G "postman/collections/*.postman_collection.json" > /dev/null; then
        for path in postman/collections/*.postman_collection.json; do
            label="$(basename "$path" .postman_collection.json)"
            run_collection "$path" "$label" --env-var "token=$TOKEN"
        done
    fi
fi

# Flows run in both suites, and always last. Each begins with its own
# /testing/reset, which wipes the qa_admin fixture and invalidates the shared
# token above, so they cannot precede the generated collections. Each mints its
# own token internally and needs only the QA secret.
if compgen -G "postman/flows/*.postman_collection.json" > /dev/null; then
    for path in postman/flows/*.postman_collection.json; do
        label="flow-$(basename "$path" .postman_collection.json)"
        run_collection "$path" "$label" --env-var "qaToken=$QA_API_TOKEN"
    done
elif [ "$SUITE" = "smoke" ]; then
    # A smoke run is nothing but flows, so an empty postman/flows/ means the
    # gate silently tested zero endpoints. Fail loudly instead.
    echo "Suite 'smoke' selected but postman/flows/ contains no collections." >&2
    exit 1
else
    echo "No flows found under postman/flows/, running generated collections only." >&2
fi

exit "$failed"
