# Contributing Guide

This is the guide for collaborating on the SAPOT repository.

## Core Principles

- `main` is the stable branch.
- All work happens in feature branches (e.g. `feature/login-system-encryption`, `feature/webRTC`, `bugfix/webRTC-no-discovery`).
- **No one commits directly to `main`.**

## Branch Structure

```
main
 ├── feature/chat-webrtc
 ├── feature/local-discovery
 ├── bugfix/sync-duplication
 └── chore/update-deps
```

### Branch Naming Convention

```
feature/<short-description>
bugfix/<short-description>
chore/<short-description>
```

## Starting New Work

1. Sync with `main`:
   ```bash
   git checkout main
   git pull origin main
   ```
2. Create a new feature branch:
   ```bash
   git checkout -b feature/<feature-name>
   ```

## Working on the Feature

### Commit Early and Often

Commit changes as soon as they can be committed, to prevent large commits.

```bash
git add .
git commit -m "feat(chat): add peer discovery.

Summary, notes, and/or changes of commit"
```

### Commit Message Format

```
type(scope): short summary.

More detailed summary
```

#### Types

- `feat` — new feature
- `fix` — bug fix
- `refactor` — code restructuring
- `docs` — documentation
- `chore` — tooling, configs

#### Example

```
docs(contributing): create contributing guide.

Created the git contributing guide with the following:
1. Core principles
2. Branch structure
3. Starting new work
4. Working on the feature
5. Commit guide
...
```

## Keep the Branch Up to Date

Regularly rebase your feature branch onto `main` to avoid conflicts:

```bash
# while inside your feature branch
git fetch origin
git rebase origin/main
```

## Pushing Your Branch for Review

```bash
git push -u origin feature/feature-name
```

## Avoid at All Costs

- No force-pushes to `main`.
- No direct commits to `main`, ever.
- No huge commits.
- Test your code before pushing.

## Related Documentation

- [docs/README.md](docs/README.md) — full documentation index
- [VERSIONING.md](VERSIONING.md) — tag conventions and release process
- [SECURITY.md](SECURITY.md) — vulnerability disclosure process
