#!/usr/bin/env bash
# Shared GitHub REST API settings for release artifact workflows.
SAPOT_GITHUB_API_VERSION=2026-03-10

github_api() {
  gh api -H "X-GitHub-Api-Version: $SAPOT_GITHUB_API_VERSION" "$@"
}
