# Versioning Guide

This repo uses git-tag-driven versioning for two independent components: **mobile** and **server**.

---

## Tag Convention

| Component | Tag format | Example |
|-----------|-----------|---------|
| Mobile | `mobile/vX.Y.Z` | `mobile/v1.0.0` |
| Server | `server/vX.Y.Z` | `server/v0.2.0` |

**Pre-release suffix:** append `-(alpha|beta|rc).N` — e.g. `mobile/v1.0.0-beta.2`.  
A tag with any `-` suffix is published as a GitHub **pre-release**. A tag without one is a full release.

---

## Cutting a Release

```bash
# 1. From the repo root, on a clean working tree:
./scripts/release.sh <mobile|server> <X.Y.Z[-(alpha|beta|rc).N]>

# Examples:
./scripts/release.sh mobile 1.0.0-beta.1
./scripts/release.sh server 0.2.0
```

The script will:
1. Bump the component's version file (`package.json` for mobile, `server/app/version.py` for server).
2. Commit the bump: `chore(version): <component> <version>`.
3. Draft release notes — using Claude (`claude-sonnet-4-6`) if `ANTHROPIC_API_KEY` is set and `@anthropic-ai/sdk` is installed locally; otherwise emit the template for manual editing.
4. Open the notes in `$EDITOR` for review (if running interactively).
5. Create an **annotated git tag** (`mobile/vX.Y.Z` or `server/vX.Y.Z`) with the notes embedded in the tag message.
6. Print the push command — **it does NOT push automatically**.

```bash
# 2. Review, then push:
git push origin HEAD && git push origin <tag>
```

---

## Release Notes

Notes are drafted **locally only** — Claude is never called from CI.

| Scenario | Result |
|----------|--------|
| `ANTHROPIC_API_KEY` set + `@anthropic-ai/sdk` installed | Claude (`claude-sonnet-4-6`) drafts notes from the commit list |
| Key or SDK absent | The template (`scripts/release-notes-prompt.md`) is filled in for you to edit |

To install the SDK locally (optional):
```bash
npm install   # at repo root — installs @anthropic-ai/sdk from package.json
```

The final notes travel with the tag. CI extracts them via `git tag -l --format='%(contents)'` and publishes them as the GitHub Release body.

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

`app.config.ts` (`version` and `extra.displayVersion`) is kept in sync by `set-version.js` — do not edit it manually.

---

## CI Behaviour

When a tag is pushed, the corresponding GitHub Actions workflow:
1. Derives the version from the tag name.
2. **Asserts** the version in the source file matches the tag (fails loudly if not).
3. Extracts the annotated tag message as release notes.
4. Creates a GitHub Release (pre-release if the tag has a `-` suffix).

CI uses **no Claude, no `@anthropic-ai/sdk`, no extra npm installs** — only the default `GITHUB_TOKEN`.

---

## Out of Scope

This versioning system covers **only** version strings and GitHub Releases. The following are handled separately:

- EAS builds and OTA updates
- Server Docker image tagging and deployment
- In-app update banners and client-version gating
