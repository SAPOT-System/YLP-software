import React, { createContext, useEffect, useState } from "react";
import { MainContainer } from "../main-container";
import { useAuthContainer } from "@/features/auth";
import { ActivityIndicator } from "react-native-paper";

export const MainContainerContext = createContext<MainContainer | null>(null);

export function MainContainerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const userContainer = useAuthContainer();
  const [container, setContainer] = useState<MainContainer | null>(null);

  useEffect(() => {
    const c = new MainContainer(userContainer);
    const init = async () => {
      await c.initialize();
      setContainer(c);
    };
    init();
  }, []);
  if (!container) {
    return <ActivityIndicator />;
  }

  return (
    <MainContainerContext.Provider value={container}>
      {children}
    </MainContainerContext.Provider>
  );
}
