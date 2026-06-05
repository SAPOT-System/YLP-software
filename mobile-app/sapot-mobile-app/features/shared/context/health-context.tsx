import React, { createContext, useContext, useEffect, useState } from "react";
import { useAuthContainer } from "@/features/auth/hooks/use-auth-container";
import { checkBackEndHealth } from "../api/connection.api";
import { usePing } from "../hooks/use-ping";
import { useAppMode } from "./app-mode-context";

export type ServerStatus = {
  online: boolean;
  latency: number | null;
  shouldWarn: boolean;
};

const ServerStatusContext = createContext<ServerStatus>({
  online: false,
  latency: null,
  shouldWarn: false,
});

export const HealthProvider = ({ children }: { children: React.ReactNode }) => {
  const { store } = useAppMode();
  const { userStore } = useAuthContainer();
  const effectiveMode = store.getEffectiveMode(userStore.isGuest);
  const isLan = effectiveMode === "lan";

  const [initialOnline, setInitialOnline] = useState(true);
  const [initialChecked, setInitialChecked] = useState(false);

  useEffect(() => {
    if (isLan) return;
    checkBackEndHealth().then((ok) => {
      setInitialOnline(ok);
      setInitialChecked(true);
    });
  }, [isLan]);

  const { online: pingOnline, latency } = usePing({ enabled: !isLan });

  const online = isLan ? true : initialChecked ? pingOnline : initialOnline;
  const isServerMode = effectiveMode === "server" || effectiveMode === "auto";
  const shouldWarn = isServerMode && !online;

  const value: ServerStatus = { online, latency: latency ?? null, shouldWarn };

  return (
    <ServerStatusContext.Provider value={value}>
      {children}
    </ServerStatusContext.Provider>
  );
};

export const useServerStatus = () => useContext(ServerStatusContext);
