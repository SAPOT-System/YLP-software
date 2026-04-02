import { useAuthContainer } from "@/features/auth";
import React, { createContext, useEffect, useState } from "react";
import { ActivityIndicator } from "react-native-paper";
import { MainContainer } from "../main-container";
import { useAppModeStore } from "./app-mode-context";

export const MainContainerContext = createContext<MainContainer | null>(null);

export function MainContainerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const userContainer = useAuthContainer();
  const appModeStore = useAppModeStore();
  const [container, setContainer] = useState<MainContainer | null>(null);

  useEffect(() => {
    const c = new MainContainer(userContainer, appModeStore);
    const init = async () => {
      await c.initialize();
      setContainer(c);
    };
    init();
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
