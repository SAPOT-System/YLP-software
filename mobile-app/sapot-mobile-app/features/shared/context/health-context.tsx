import React, { createContext, useContext, useEffect, useState } from "react";
import { useAuthContainer } from "@/features/auth/hooks/use-auth-container";
import { checkBackEndHealth } from "../api/connection.api";
import { usePing } from "../hooks/use-ping";
import { healthLog } from "../utils/logger";
import { useAppMode } from "./app-mode-context";
healthLog.debug("[health-context] module loaded");

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
    healthLog.debug("health › immediate check start");
    checkBackEndHealth().then((ok) => {
      healthLog.info("health › immediate check result", { ok });
      setInitialOnline(ok);
      setInitialChecked(true);
    });
  }, [isLan]);

  const { online: pingOnline, latency } = usePing({ enabled: !isLan });

  const online = isLan ? false : initialChecked ? pingOnline : initialOnline;
  const isServerMode = effectiveMode === "server" || effectiveMode === "auto";
  const shouldWarn = isServerMode && !online;

  healthLog.debug("health › status", { online, latency, shouldWarn, effectiveMode });

  const value: ServerStatus = { online, latency: latency ?? null, shouldWarn };

  return (
    <ServerStatusContext.Provider value={value}>
      {children}
    </ServerStatusContext.Provider>
  );
};

export const useHealth = () => useContext(ServerStatusContext).online;
export const useServerStatus = () => useContext(ServerStatusContext);
