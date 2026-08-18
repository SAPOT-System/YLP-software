#!/usr/bin/env bash
set -euo pipefail

SELF=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
source "$SELF/lib/deploy-common.sh"

current=$(readlink -f "$SAPOT_ROOT/releases/current" 2>/dev/null || true)
if [ -z "$current" ]; then
  log_error "No current release found at $SAPOT_ROOT/releases/current"
  exit 1
fi

log_info "Applying compose configuration for gsm-fastapi..."
compose "$current" up -d gsm-fastapi

log_info "gsm-fastapi container has been restarted."
