import React, { createContext, useContext, useEffect, useState } from "react";
import { ActivityIndicator } from "react-native";
import { AppContainer } from "../container";

const ContainerContext = createContext<AppContainer | null>(null);

export function ContainerProvider({ children }: { children: React.ReactNode }) {
  const [container, setContainer] = useState<AppContainer | null>(null);

  useEffect(() => {
    const c = new AppContainer();
    const init = async () => {
      await c.initialize();
      setContainer(c);
    };
    init();
  }, []);

  if (!container) return <ActivityIndicator />;

  return (
    <ContainerContext.Provider value={container}>
      {children}
    </ContainerContext.Provider>
  );
}

export function useContainer() {
  const container = useContext(ContainerContext);
  if (!container) throw new Error("Container not initialized");
  return container;
}

export function useDiscoveryService() {
  return useContainer().discoveryService;
}

export function usePeerDatabaseService() {
  return useContainer().peerDatabaseService;
}
