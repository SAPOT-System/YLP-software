# Windows/PowerShell equivalent of up.sh — thin wrapper around
# `docker compose` that auto-detects this machine's LAN IP (via
# detect-ip.ps1) and adds it to CERT_SAN, so the dev TLS cert (gen-certs.sh)
# validates when a client connects via LAN IP instead of localhost.
#
# Respects an already-set CERT_SAN (set in the environment before running,
# or inline: `$env:CERT_SAN = "..."; docker/up.ps1 up`) rather than
# overriding it. A CERT_SAN set only in .env is not visible here (docker
# compose reads .env itself) — auto-detection wins in that case unless you
# set it in the environment first. Keep in sync with up.sh.
#
# Passes --env-file server/.env explicitly: docker-compose.yml's
# ${MYSQL_*} substitutions are read from this file, since Compose only
# auto-loads a .env next to the compose file (repo root) by default.
#
# Usage: docker/up.ps1 up --build
#        docker/up.ps1 run --rm api pytest
#        (any other docker compose subcommand/args)

$ErrorActionPreference = "Stop"

Set-Location (Join-Path $PSScriptRoot "..")

if (-not $env:CERT_SAN) {
    $hostIp = $null
    try {
        $hostIp = & (Join-Path $PSScriptRoot "detect-ip.ps1")
    } catch {
        $hostIp = $null
    }

    $certSan = "DNS:localhost,IP:127.0.0.1"
    if ($hostIp) {
        $certSan = "$certSan,IP:$hostIp"
        Write-Host "docker/up.ps1: detected LAN IP $hostIp, added to CERT_SAN"
    } else {
        Write-Host "docker/up.ps1: could not detect LAN IP, CERT_SAN=$certSan"
    }
    $env:CERT_SAN = $certSan
}

docker compose --env-file server/.env @args
