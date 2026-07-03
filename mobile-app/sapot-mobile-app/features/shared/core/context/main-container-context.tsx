import { useAuthContainer } from "@/features/auth/hooks/use-auth-container";
import React, { createContext, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Button, Text } from "react-native-paper";
import { PageLoader } from "@/features/shared/components/page-loader";
import { MainContainer, setResetRequestedCallback } from "../../main-container";
import { appLog } from "../utils/logger";
import { useAppModeStore } from "./app-mode-context";

appLog.debug("[main-container-context] module loaded");

export const MainContainerContext = createContext<MainContainer | null>(null);

export function MainContainerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const userContainer = useAuthContainer();
  const appModeStore = useAppModeStore();
  const [container, setContainer] = useState<MainContainer | null>(null);
  const [initFailed, setInitFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const containerRef = useRef<MainContainer | null>(null);

  useEffect(() => {
    setInitFailed(false);

    const init = async () => {
      try {
        setContainer(null);
        appLog.info("app › container init start");
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
        setContainer(c);
        appLog.info("app › container init complete");
      } catch (error) {
        appLog.error("app › container init failed", { error });
        setInitFailed(true);
      }
    };

    init();

    return () => {
      containerRef.current?.cleanup();
      containerRef.current = null;
    };
  // appModeStore intentionally omitted: services hold a direct reference and read mode
  // reactively at call time, so no container rebuild is needed on mode changes. Including
  // it races against post-login auth state updates and causes "Current user not initialized"
  // crashes. Only retryCount (explicit reset) and userContainer (new AuthContainer) should
  // trigger a rebuild.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userContainer, retryCount]);

  if (initFailed) {
    appLog.error("app › container failed to initialize");
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text variant="titleMedium" style={{ textAlign: "center", marginBottom: 8 }}>
          Unable to load your account
        </Text>
        <Text variant="bodyMedium" style={{ textAlign: "center", marginBottom: 24, opacity: 0.7 }}>
          Something went wrong loading your encryption keys. Please try again.
        </Text>
        <Button
          mode="contained"
          onPress={() => {
            setInitFailed(false);
            setRetryCount((c) => c + 1);
          }}
        >
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
