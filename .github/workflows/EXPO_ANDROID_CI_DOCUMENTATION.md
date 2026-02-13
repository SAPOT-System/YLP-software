# Expo Android CI/CD Pipeline Documentation

## Overview

Automates code quality validation on pull requests and builds Android APKs for development and production releases.

## Workflow Triggers

| Event           | Condition         | Jobs        |
| --------------- | ----------------- | ----------- |
| Pull Request    | PR to `develop`   | `pr-checks` |
| Push to develop | Push to `develop` | `pr-checks` |

## Jobs

### pr-checks
Validates code quality before merging.
- Lints and typechecks code
- Runs unit tests (if present)
- Validates Expo configuration
Blocks merge on failure.

## Configuration

- **Node.js:** v20.19.6 (LTS) with npm caching
- **Working directory:** `mobile-app/sapot-mobile-app/`

## Setup

### Local Commands
```bash
cd mobile-app/sapot-mobile-app
npm ci                                    # Install dependencies
npm run lint                              # Lint code
npm run typecheck                         # Type check
npm test -- --runInBand                   # Run tests
npx expo-doctor                           # Validate Expo setup
```

## Troubleshooting

| Issue             | Cause                       | Fix                                                    |
| ----------------- | --------------------------- | ------------------------------------------------------ |
| Lint fails        | Code style violations       | Run `npm run lint` and fix issues                      |
| Typecheck fails   | TypeScript errors           | Run `npm run typecheck` and fix types                  |
| Tests fail        | Test failures               | Run `npm test -- --runInBand` locally                  |
| Expo Doctor fails | Invalid config/missing deps | Run `npx expo-doctor` and check `app.json`, `eas.json` |
