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

Tags are immutable release identifiers. Never move, delete, or reuse a published
component tag to point at a newer commit. Each component is versioned independently:
a new server release does not require a new mobile, admin, portal, or GSM release.

---

## Release Preflight

Before choosing a version, update local tag references and confirm that both the
tag and GitHub Release do not already exist. Do this for every component being
released:

```bash
git fetch origin --tags
git tag -l '<component>/vX.Y.Z'
gh release view '<component>/vX.Y.Z'
```

If the tag already exists, choose the next valid SemVer version. Do **not**
retag it, even when the source file currently contains the same version. A
source version and a tag can diverge when an earlier release was tagged but not
merged into the branch now being released.

This check must happen before `scripts/release.sh`: the script creates its bump
commit before it detects an existing local tag, so a duplicate tag otherwise
leaves an unwanted intermediate version-bump commit to clean up.

Also start from a clean working tree. The script intentionally refuses to run
when unrelated changes are present.

---

## Release Workflow

For a stable release, prepare the version bump in a release PR, merge that PR
into `main` with a merge commit, then create and push the annotated tag from the
merged `main` commit. Do not publish a stable component tag from `develop` or a
feature branch.

Use `-alpha.N`, `-beta.N`, or `-rc.N` only for an explicitly testable
pre-release. Those tags may be created from the branch being tested, and GitHub
publishes them as pre-releases.

### Prepare the release PR

Run the component version step on a clean release branch after completing the
preflight above:

```bash
# From the repo root, on a clean release branch:
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
3. Create a local **annotated git tag** (`<component>/vX.Y.Z`).
4. Print the push command — **it does NOT push automatically**.

Do not push that local tag until the release PR is merged. If the PR uses a
merge commit, recreate the annotated tag at the merged `main` commit before
pushing it; the tag must identify the exact commit that is released. Do not
push a tag that points only at an unmerged release branch.

### Publish after the PR is merged

1. Confirm the release PR is merged and `main` is checked out at the merge
   commit.
2. Confirm the version source on `main` matches the intended version.
3. Create an annotated `<component>/vX.Y.Z` tag on that commit, with message
   `<component> <version>`.
4. Push `main`, then push the tag. The tag-triggered workflow creates the
   GitHub Release.

```bash
# Example after merge, from main:
git tag -a server/v0.2.0 -m 'server 0.2.0'
git push origin main
git push origin server/v0.2.0
```

If a release tag was created locally while preparing the PR, delete that local
tag and recreate it at the merged commit before the final push. Never delete or
replace a tag that has already been pushed.

### Component verification

Run the verification for every component whose version is bumped. In addition
to the component's normal test command, a server version bump changes the
generated OpenAPI snapshots' `info.version`. Regenerate and check them before
opening the release PR:

```bash
python3 scripts/generate_openapi_docs.py
python3 scripts/generate_openapi_docs.py --check
```

Run these commands from the repository root. Without regeneration, the
Generated Docs Check fails even when no endpoint shape changed.

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
- Offline Docker bundles: a bundle uses the server `__version__` at build time and records its exact artifact metadata in `manifest.json`; see [the Docker bundle deployment guide](docs/deployment/docker-bundle.md)
- In-app update banners and client-version gating
