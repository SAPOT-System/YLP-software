import { authLog } from "@/features/shared/utils/logger";
import React, { createContext, useEffect, useState } from "react";
import { ActivityIndicator } from "react-native-paper";
import { AuthContainer } from "../auth-container";

export const AuthContainerContext = createContext<AuthContainer | null>(null);

export function AuthContainerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [container, setContainer] = useState<AuthContainer | null>(null);

  useEffect(() => {
    authLog.info("[AuthContainerProvider] mounted");
    const c = new AuthContainer();
    const init = async () => {
      try {
        await c.initialize();
        setContainer(c);
      } catch (error) {
        authLog.error("[AuthContainerProvider] Error in initialize", { error });
      }
    };
    init();
    return () => {
      authLog.info("[AuthContainerProvider] unmounted");
    };
  }, []);

  if (!container) {
    authLog.info("[AuthContainerProvider] container not ready");
    return <ActivityIndicator />;
  }

  return (
    <AuthContainerContext.Provider value={container}>
      {children}
    </AuthContainerContext.Provider>
  );
}
