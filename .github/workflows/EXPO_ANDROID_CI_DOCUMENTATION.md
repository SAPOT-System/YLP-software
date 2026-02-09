# Expo Android CI/CD Pipeline Documentation

## Overview

This GitHub Actions workflow automates the continuous integration and deployment process for the Sapot mobile application on Android. It enforces code quality standards for pull requests and builds production-ready APKs/AABs for releases.

---

## Workflow Triggers

The workflow runs automatically on the following events:

| Event | Condition | Job(s) Triggered |
|-------|-----------|------------------|
| **Pull Request** | `pull_request` to `develop` branch | `pr-checks` |
| **Push to develop** | `push` to `develop` branch | `pr-checks`, `dev-build` |
| **Release Tags** | `push` with tag matching `v*` | `production-build` |

---

## Jobs

### 1. PR Quality Gate (`pr-checks`)

**Trigger:** Pull requests and pushes to `develop`

**Purpose:** Validates code quality before merging.

**Steps:**

- **Checkout code:** Fetches the repository
- **Setup Node.js:** Installs Node.js v20.19.6 and caches npm dependencies
- **Install dependencies:** Runs `npm ci` in `mobile-app/sapot-mobile-app/`
- **Lint:** Runs `npm run lint` to check code style
- **Typecheck:** Runs `npm run typecheck` to verify TypeScript types
- **Unit tests:** Runs `npm test -- --runInBand` (only if test files exist)
- **Expo Doctor:** Runs `npx expo-doctor` to validate Expo configuration

**Outputs:** Fails the workflow if any check fails, blocking merges.

---

### 2. Development Build (`dev-build`)

**Trigger:** Push to `develop` branch (and after `pr-checks` passes)

**Purpose:** Builds a development Android client for internal testing.

**Steps:**

- **Checkout code:** Fetches the repository
- **Setup Node.js:** Installs Node.js v20.19.6 and caches npm dependencies
- **Install dependencies:** Runs `npm ci`
- **Install EAS CLI:** Global installation of Expo's build service CLI
- **Authenticate:** Logs into Expo using `EXPO_TOKEN` secret
- **Build:** Runs `eas build --platform android --profile development --non-interactive`

**Outputs:** Development Android client (APK or AAB) available via Expo dashboard

**Requirements:**

- Valid `EXPO_TOKEN` secret configured in repository

---

### 3. Production Build (`production-build`)

**Trigger:** Push with version tags matching `v*` (e.g., `v1.0.0`)

**Purpose:** Builds production-ready Android application for release.

**Steps:**

- **Checkout code:** Fetches the repository
- **Setup Node.js:** Installs Node.js v20.19.6 and caches npm dependencies
- **Install dependencies:** Runs `npm ci`
- **Install EAS CLI:** Global installation of Expo's build service CLI
- **Authenticate:** Logs into Expo using `EXPO_TOKEN` secret
- **Build:** Runs `eas build --platform android --profile production --non-interactive`

**Outputs:** Production Android client ready for Play Store distribution

**Requirements:**

- Valid `EXPO_TOKEN` secret configured in repository
- Tag must follow semantic versioning (e.g., `v1.0.0`, `v2.3.4-beta`)

---

## Environment Configuration

### Node.js Version

- **Version:** 20.19.6 (LTS)
- **Cache:** Enabled for npm packages

### Working Directory

All steps run in: `mobile-app/sapot-mobile-app/`

### Build Profiles

Two EAS build profiles are used:

- **development:** Faster builds, includes debugging tools
- **production:** Optimized release build, signed for Play Store

---

## Required Secrets

### `EXPO_TOKEN`

- **Type:** Repository secret
- **Required for:** dev-build and production-build jobs
- **How to set up:**
  1. Login to [expo.dev](https://expo.dev/) → Access tokens
  2. Create token
  3. Copy the token in the column **value**
  4. Go to repository Settings → Secrets and variables → Actions
  5. Create new secret named `EXPO_TOKEN`
  6. Paste the token value

---

## Local Development

To understand what the CI/CD does locally:

```bash
# Navigate to project
cd mobile-app/sapot-mobile-app

# Install dependencies
npm ci

# Run quality checks
npm run lint
npm run typecheck
npm test -- --runInBand

# Validate Expo setup
npx expo-doctor

# Build development version locally
eas build --platform android --profile development

# Build production version locally
eas build --platform android --profile production
```

---

## Troubleshooting

### Build Fails at "Lint" Step

- **Cause:** ESLint configuration issues or code style violations
- **Fix:** Run `npm run lint` locally and fix reported issues
- **Ref:** See `eslint.config.js`

### Build Fails at "Typecheck" Step

- **Cause:** TypeScript errors in the codebase
- **Fix:** Run `npm run typecheck` locally and fix type issues
- **Ref:** See `tsconfig.json`

### Build Fails at "Unit tests" Step

- **Cause:** Test failures
- **Fix:** Run `npm test -- --runInBand` locally to identify failing tests
- **Ref:** See `jest-setup.js` for test configuration

### Build Fails at "Expo Doctor" Step

- **Cause:** Invalid Expo configuration or missing dependencies
- **Fix:** Run `npx expo-doctor` locally for detailed diagnostics
- **Ref:** Check `app.json`, `eas.json`, and `package.json`

### Build Fails at "Login to Expo" Step

- **Cause:** Invalid or expired `EXPO_TOKEN`
- **Fix:**
  1. Verify token is set correctly in repository secrets
  2. Generate a new token: `eas token create`
  3. Update the `EXPO_TOKEN` secret

### Build Fails at EAS Build Step

- **Cause:** Misconfigured `eas.json` or build environment issues
- **Fix:**
  1. Review `eas.json` for correct profiles
  2. Check Expo dashboard for detailed build logs
  3. Ensure all required app credentials are configured

---

## Common Tasks

### Creating a Release

```bash
# Tag the commit with version number
git tag v1.0.0
git push origin v1.0.0
```

This triggers the `production-build` job automatically.

### Hotfixing to Develop

1. Push changes to a feature branch
2. Create a pull request to `develop`
3. Once merged, the `dev-build` job runs automatically

### Viewing Build Status

- Pull requests: Check the **Checks** tab
- Development builds: Expo dashboard → Builds tab
- Production builds: Expo dashboard → Builds tab

---

## Related Files

- `eslint.config.js` - Linting configuration
- `tsconfig.json` - TypeScript configuration
- `jest-setup.js` - Jest testing configuration
- `eas.json` - EAS build profiles and configuration
- `app.json` - Expo app configuration
- `package.json` - Project dependencies and scripts

---

## See Also

- [Expo Documentation](https://docs.expo.dev/)
- [EAS Build Documentation](https://docs.expo.dev/eas-update/introduction/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
