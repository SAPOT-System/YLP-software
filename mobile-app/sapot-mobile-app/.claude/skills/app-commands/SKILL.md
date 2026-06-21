# app-commands

## Description

Complete CLI reference for the Sapot mobile app. Covers the dev server, Android builds (local and EAS cloud), OTA updates, and all quality-check commands. Use this whenever you need to know the exact command to run — not as behavioral guidance; the commands themselves do not affect how code should be written.

## Usage

Invoke this skill when:
- The user asks how to start the dev server, run on a device, or build an APK
- The user asks how to run tests, typecheck, or lint
- The user asks about EAS builds or OTA updates
- You need to tell the user the exact command to run after making a change

Do **not** use this skill to decide *whether* to run a command — that is governed by the Definition of Done in CLAUDE.md.

## Commands

### Development

```bash
# Start dev server (sets APP_VARIANT=development)
npm run dev

# Prebuild native code (required before first run or after native dependency changes)
npm run prebuild          # expo prebuild --clean for development variant

# Run on connected Android device or emulator
npm run android           # uses dev app-id
```

### EAS Cloud Builds

Full native builds via Expo Application Services. Use when you need a distributable APK/AAB.

```bash
npm run android:dev       # development profile
npm run android:prev      # preview profile (internal testing)
npm run android:prod      # production profile (Play Store)
```

### EAS OTA Updates

Push a new JS bundle without a full native rebuild. Only works for JS-only changes.

```bash
npm run update:dev        # push to development channel
npm run update:prev       # push to preview channel
npm run update:prod       # push to production channel
```

### Quality Checks

```bash
# TypeScript type check (no emit)
npm run typecheck

# ESLint
npm run lint

# Jest — run tests for affected files
npm test

# Full gate: tests + typecheck + lint + expo-doctor
npm run testAll
```

### Running Specific Tests

```bash
# Single test file
npx jest path/to/test.ts

# Tests matching a name pattern
npx jest --testNamePattern="pattern"

# Example: run all ConnectionService tests
npx jest features/shared/services/__tests__/ConnectionService
```

## Expected Output

When the user asks "how do I run tests?":
→ Return the relevant command block above with a one-line explanation of what it does.

When a task is complete and the Definition of Done requires verification:
→ State which commands need to pass (`npm run typecheck`, `npm test`, `npm run lint`) and show the exact invocation if needed.

When the user asks about builds vs OTA:
→ Distinguish between EAS cloud builds (full native, distributable) and OTA updates (JS-only, faster, limited to JS changes).
