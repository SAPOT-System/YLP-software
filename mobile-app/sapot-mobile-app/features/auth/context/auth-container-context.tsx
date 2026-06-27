import { toAppError } from "@/features/shared/core/errors";
import { authLog } from "@/features/shared/core/utils/logger";
import React, { createContext, useEffect, useState } from "react";
import { PageLoader } from "@/features/shared/components/page-loader";
import { AuthContainer } from "../auth-container";
import { getApiUrl, initRuntimeOverrides } from "@/config/runtime";
import { apiClient } from "@/features/shared";

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
        await initRuntimeOverrides();
        apiClient.defaults.baseURL = getApiUrl();
        await c.initialize();
        setContainer(c);
      } catch (error) {
        const appErr = toAppError(error, "auth");
        authLog.error("[AuthContainerProvider] Error in initialize", appErr);
      }
    };
    init();
    return () => {
      authLog.info("[AuthContainerProvider] unmounted");
    };
  }, []);

  if (!container) {
    authLog.info("[AuthContainerProvider] container not ready");
    return <PageLoader />;
  }

  return (
    <AuthContainerContext.Provider value={container}>
      {children}
    </AuthContainerContext.Provider>
  );
}
