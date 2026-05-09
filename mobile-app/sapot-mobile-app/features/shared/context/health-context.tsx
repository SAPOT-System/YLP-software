import React, { createContext, useContext, useEffect, useState } from "react";
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
  const { mode } = useAppMode();
  const [initialOnline, setInitialOnline] = useState(true);
  const [initialChecked, setInitialChecked] = useState(false);

  useEffect(() => {
    healthLog.debug("health › immediate check start");
    checkBackEndHealth().then((ok) => {
      healthLog.info("health › immediate check result", { ok });
      setInitialOnline(ok);
      setInitialChecked(true);
    });
  }, []);

  const { online: pingOnline, latency } = usePing();

  const online = initialChecked ? pingOnline : initialOnline;
  const isServerMode = mode === "server" || mode === "auto";
  const shouldWarn = isServerMode && !online;

  healthLog.debug("health › status", { online, latency, shouldWarn, mode });

  const value: ServerStatus = { online, latency: latency ?? null, shouldWarn };

  return (
    <ServerStatusContext.Provider value={value}>
      {children}
    </ServerStatusContext.Provider>
  );
};

export const useHealth = () => useContext(ServerStatusContext).online;
export const useServerStatus = () => useContext(ServerStatusContext);
