# Contribution Guide

## Scope

This repository contains the React Native / Expo mobile app. The `server/` folder is included for reference only and should not be edited.

## Setup

1. Install dependencies.

```bash
npm install
```

2. Create a `.env.local` file in the project root and set your LAN IP.

```env
EXPO_PUBLIC_DEV_HOST=192.168.1.x
```

3. Create a `.env.development.local` file if you want to limit log output.

```env
EXPO_PUBLIC_ENABLED_LOG_MODULES=connection,network,background
```

4. Start the app in development mode.

```bash
npm run dev
```

## Build and Update Scripts

- Use `android:dev`, `android:prev`, or `android:prod` when you change native code, plugins, permissions, app config, or anything that requires rebuilding the app binary.
- Use `android` as the local alternative to `android:dev`.
- Use `update:dev`, `update:prev`, or `update:prod` when the change is UI-only or JavaScript-only and does not require a new binary.
- Use `android:prev` and `update:prev` only when the current code is already committed in GitHub.
- Use `android:dev` and `update:dev` for local development.
- Use `android:prod` and `update:prod` for production release work.

## Android Signing Setup

Use this section when you want to use `android` as the local alternative to `android:dev`.

Before running Android builds:

1. Run `npm run prebuild`.
2. Create a `.env` file in the project root with these values:

```env
ANDROID_KEYSTORE_PATH=
ANDROID_KEYSTORE_PASSWORD=
ANDROID_KEY_ALIAS=
ANDROID_KEY_PASSWORD=
```

To fill them in:

1. Run `eas credentials`.
2. Choose `Android`.
3. Choose `development`.
4. Select `Keystore: Manage everything needed to build your project`.
5. Select `Download existing keystore`.
6. Press Enter or type `Y` when prompted.
7. Copy the keystore password, key alias, key password, and keystore path into `.env`.
8. Place the generated `.jks` file in the `keystore/` folder.
9. Run `node scripts/setup-android-signing.js`.
10. Run `npm run android`.

## Before You Open a PR

- Run `npm run typecheck` after TypeScript changes.
- Run `npm run lint` before submitting code.
- Run `npm test` when your change touches shared logic, hooks, services, or tests.
- Update the relevant file in `docs/` when you change APIs, services, schemas, messages, sync behavior, or environment config.

## Code Style

- Keep changes small and focused.
- Follow the existing feature structure under `features/<name>/`.
- Use TypeScript types explicitly.
- Prefer existing app patterns over adding new abstractions.

## Testing Notes

- Tests use Jest with the shared mocks in `jest-setup.js`.
- Place new tests beside the code they cover, usually in `__tests__/` folders.
- If you add or change test helpers, update `docs/TESTING.md`.

## Useful Commands

```bash
npm run dev
npm run typecheck
npm run lint
npm test
```