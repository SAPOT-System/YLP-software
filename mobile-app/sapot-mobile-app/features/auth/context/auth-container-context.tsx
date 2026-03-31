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
    const c = new AuthContainer();
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
    <AuthContainerContext.Provider value={container}>
      {children}
    </AuthContainerContext.Provider>
  );
}
