import { configLog } from "@/features/shared/core/utils/logger";

// Dev/QA-only feature gate. `__DEV__` covers local development; the
// `EXPO_PUBLIC_DEBUG_MENU` env var lets a preview/EAS build opt in for QA
// without shipping the flag in a production build. Never true in a release
// build (see docs/superpowers/plans/2026-07-10-tls-trust-migration.md §Task 3.2).
export const IS_DEBUG_ENABLED =
  __DEV__ || process.env.EXPO_PUBLIC_DEBUG_MENU === "1";

configLog.debug("[config/debug] loaded", { IS_DEBUG_ENABLED });
