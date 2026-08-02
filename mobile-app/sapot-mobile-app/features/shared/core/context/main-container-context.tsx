import { useAuthContainer } from "@/features/auth/hooks/use-auth-container";
import React, { createContext, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Button, Text } from "react-native-paper";
import { PageLoader } from "@/features/shared/components/page-loader";
import { MainContainer, setResetRequestedCallback } from "../../main-container";
import { KeyInitError, toKeyInitError } from "../errors";
import type { KeyInitErrorCode } from "../errors";
import { appLog } from "../utils/logger";
import { useAppModeStore } from "./app-mode-context";

appLog.debug("[main-container-context] module loaded");

export const MainContainerContext = createContext<MainContainer | null>(null);

/**
 * Short, non-technical explanation per failure reason. The raw code is shown
 * alongside it so a bug report identifies the failing step without the reporter
 * having to pull logs.
 */
const FAILURE_REASONS: Record<KeyInitErrorCode, string> = {
  AUTH_STATE_NOT_READY: "Your sign-in had not finished when the app tried to load your keys.",
  SECURE_STORE_READ_FAILED: "Your saved encryption keys could not be read from this device.",
  MASTER_KEY_UNAVAILABLE: "Your encryption keys are not on this device. Sign in again to restore them.",
  MASTER_KEY_UNWRAP_FAILED: "Your encryption keys could not be unlocked with your password.",
  KEY_SERVER_UNREACHABLE: "The server could not be reached to fetch your encryption keys.",
  PEER_KEY_INIT_FAILED: "Your messaging keys could not be set up.",
  CONTACT_KEY_SYNC_FAILED: "Your contacts' keys could not be loaded.",
  GUEST_KEY_INIT_FAILED: "Guest encryption keys could not be set up.",
  UNKNOWN: "Something went wrong loading your encryption keys.",
};

export function MainContainerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const userContainer = useAuthContainer();
  const appModeStore = useAppModeStore();
  const [container, setContainer] = useState<MainContainer | null>(null);
  const [initError, setInitError] = useState<KeyInitError | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const containerRef = useRef<MainContainer | null>(null);
  const teardownRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    // Guards every state write below. Without it a slow run that fails after a
    // newer run already succeeded drops the app back onto the error screen,
    // which is why "Try Again" appeared not to work.
    let isCurrentRun = true;

    setInitError(null);

    const init = async () => {
      // Wait for the previous attempt to finish releasing its transport,
      // timers and listeners, so a retry starts from a clean container instead
      // of racing the teardown of the run that just failed.
      await teardownRef.current;
      if (!isCurrentRun) return;

      try {
        setContainer(null);
        appLog.info("app › container init start");

        if (!userContainer.userStore.hasUser) {
          throw new KeyInitError(
            "auth state has not settled yet",
            "AUTH_STATE_NOT_READY"
          );
        }

        const c = new MainContainer(userContainer, appModeStore);
        containerRef.current = c;

        // Register the migration completion callback so GuestMigrationService can
        // reset MainContainer without needing a direct reference to it.
        userContainer.guestMigrationService.setOnMigrationComplete(() => {
          c.resetForMigration();
          appLog.info("app › container reset for auth migration");
        });

        setResetRequestedCallback(() => {
          setRetryCount((n) => n + 1);
          appLog.info("app › container reset requested for relogin");
        });

        await c.initialize();
        if (!isCurrentRun) return;
        setContainer(c);
        appLog.info("app › container init complete");
      } catch (error) {
        const keyError = toKeyInitError(error);
        appLog.error("app › container init failed", {
          code: keyError.code,
          detail: keyError.detail,
          message: keyError.message,
          isCurrentRun,
        });
        if (!isCurrentRun) return;
        setInitError(keyError);
      }
    };

    init();

    return () => {
      isCurrentRun = false;
      const previous = containerRef.current;
      containerRef.current = null;
      if (previous) {
        teardownRef.current = previous
          .cleanup()
          .catch((error) =>
            appLog.warn("app › container cleanup failed", { error })
          );
      }
    };
  // appModeStore intentionally omitted: services hold a direct reference and read mode
  // reactively at call time, so no container rebuild is needed on mode changes. Including
  // it races against post-login auth state updates and causes "Current user not initialized"
  // crashes. Only retryCount (explicit reset) and userContainer (new AuthContainer) should
  // trigger a rebuild.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userContainer, retryCount]);

  if (initError) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text variant="titleMedium" style={{ textAlign: "center", marginBottom: 8 }}>
          Unable to load your account
        </Text>
        <Text variant="bodyMedium" style={{ textAlign: "center", marginBottom: 8, opacity: 0.7 }}>
          {FAILURE_REASONS[initError.code]} Please try again.
        </Text>
        <Text variant="bodySmall" style={{ textAlign: "center", marginBottom: 24, opacity: 0.5 }}>
          {initError.detail
            ? `${initError.code} (${initError.detail})`
            : initError.code}
        </Text>
        <Button mode="contained" onPress={() => setRetryCount((c) => c + 1)}>
          Try Again
        </Button>
      </View>
    );
  }

  if (!container) {
    return <PageLoader />;
  }

  return (
    <MainContainerContext.Provider value={container}>
      {children}
    </MainContainerContext.Provider>
  );
}
