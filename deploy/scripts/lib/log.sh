#!/usr/bin/env bash

log_info() { printf '[INFO] %s\n' "$*"; }
log_warn() { printf '[WARN] %s\n' "$*"; }
log_error() { printf '[ERROR] %s\n' "$*" >&2; }
log_pass() { printf '[PASS] %s\n' "$*"; }
log_fail() { printf '[FAIL] %s\n' "$*" >&2; }
