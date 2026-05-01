import { useAuthContainer } from "@/features/auth/hooks/use-auth-container";
import { getApiUrl, initRuntimeOverrides } from "@/config/runtime";
import { apiClient } from "@/features/shared/api/client";
import React, { createContext, useEffect, useRef, useState } from "react";
import { ActivityIndicator } from "react-native-paper";
import { MainContainer } from "../main-container";
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
  const containerRef = useRef<MainContainer | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        appLog.info("app › container init start");
        await initRuntimeOverrides();
        apiClient.defaults.baseURL = getApiUrl();
        const c = new MainContainer(userContainer, appModeStore);
        containerRef.current = c;
        await c.initialize();
        setContainer(c);
        appLog.info("app › container init complete");
      } catch (error) {
        appLog.error("app › container init failed", { error });
      }
    };
    init();

    return () => {
      containerRef.current?.cleanup();
      containerRef.current = null;
    };
  }, [appModeStore, userContainer]);
  if (!container) {
    return <ActivityIndicator />;
  }

  return (
    <MainContainerContext.Provider value={container}>
      {children}
    </MainContainerContext.Provider>
  );
}
