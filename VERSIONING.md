# Versioning Guide

This repo uses git-tag-driven versioning for five independent components: **mobile**, **server**, **admin**, **portal** (captive portal), and **gsm** (GSM-module: `GSM-fastapi` + the production Arduino firmware, versioned together since they implement one wire-protocol contract).

`GSM-module/GSM-API/` and `GSM-trial-code/` are not covered — neither is deployed (see `GSM-module/CLAUDE.md`). `tileserver/` has no source of its own (deploy scripts + `.mbtiles` data only) and isn't versioned.

---

## Tag Convention

| Component | Tag format | Example |
|-----------|-----------|---------|
| Mobile | `mobile/vX.Y.Z` | `mobile/v1.0.0` |
| Server | `server/vX.Y.Z` | `server/v0.2.0` |
| Admin | `admin/vX.Y.Z` | `admin/v0.2.0` |
| Captive Portal | `portal/vX.Y.Z` | `portal/v0.2.0` |
| GSM Module | `gsm/vX.Y.Z` | `gsm/v0.2.0` |

**Pre-release suffix:** append `-(alpha|beta|rc).N` — e.g. `mobile/v1.0.0-beta.2`.  
A tag with any `-` suffix is published as a GitHub **pre-release**. A tag without one is a full release.

---

## Cutting a Release

```bash
# 1. From the repo root, on a clean working tree:
./scripts/release.sh <mobile|server|admin|portal|gsm> <X.Y.Z[-(alpha|beta|rc).N]>

# Examples:
./scripts/release.sh mobile 1.0.0-beta.1
./scripts/release.sh server 0.2.0
./scripts/release.sh admin 0.2.0
./scripts/release.sh portal 0.2.0
./scripts/release.sh gsm 0.2.0-beta.1
```

The script will:
1. Bump the component's version file(s) (`package.json` for mobile and admin, `server/app/version.py` for server, `captive-portal/VERSION` for portal, `GSM-module/GSM-fastapi/app_version.py` **and** the Arduino firmware's `FIRMWARE_VERSION` define for gsm).
2. Commit the bump: `chore(version): <component> <version>`.
3. Create an **annotated git tag** (`<component>/vX.Y.Z`).
4. Print the push command — **it does NOT push automatically**.

```bash
# 2. Review, then push:
git push origin HEAD && git push origin <tag>
```

---

## Semver Bump Guidance

| Change type | Bump |
|------------|------|
| Breaking API or data change | Major (`X`) |
| New feature, backward-compatible | Minor (`Y`) |
| Bug fix, patch | Patch (`Z`) |
| Unstable / pre-release | Use `-alpha.N`, `-beta.N`, or `-rc.N` suffix |

---

## Version Sources

| Component | Single source of truth |
|-----------|----------------------|
| Mobile | `mobile-app/sapot-mobile-app/package.json` → `version` |
| Server | `server/app/version.py` → `__version__` |
| Admin | `admin-frontend/sapot-admin/package.json` → `version` |
| Captive Portal | `captive-portal/VERSION` (plain text) |
| GSM Module | `GSM-module/GSM-fastapi/app_version.py` → `__version__` **and** `GSM-module/GSM-arduino-actual-code/GSM-arduino-actual-code.ino` → `FIRMWARE_VERSION` (kept in lockstep by `GSM-module/scripts/set_version.py`) |

`app.config.ts` (`version` and `extra.displayVersion`) is kept in sync by `set-version.js` — do not edit it manually.

---

## CI Behaviour

When a tag is pushed, the corresponding GitHub Actions workflow:
1. Derives the version from the tag name.
2. **Asserts** the version in the source file matches the tag (fails loudly if not).
3. Extracts the annotated tag message (`<component> <version>`) as the GitHub Release body.
4. Creates a GitHub Release (pre-release if the tag has a `-` suffix).

CI does not draft or edit notes — it only reads the tag message and publishes it, using the default `GITHUB_TOKEN`.

---

## Out of Scope

This versioning system covers **only** version strings and GitHub Releases. The following are handled separately:

- EAS builds and OTA updates
- Server Docker image tagging and deployment
- In-app update banners and client-version gating
