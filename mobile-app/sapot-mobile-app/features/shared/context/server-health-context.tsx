import React, { createContext, useContext, useEffect, useState } from "react";
import { useAuthContainer } from "@/features/auth/hooks/use-auth-container";
import { checkBackEndHealth } from "../api/connection.api";
import { useHealthPoll } from "../hooks/use-health-poll";
import { healthLog } from "../utils/logger";
import { useAppModeStore } from "./app-mode-context";
healthLog.debug("[server-health-context] module loaded");

export type ServerHealthStatus = {
  online: boolean;
};

const ServerHealthContext = createContext<ServerHealthStatus>({ online: true });

export function ServerHealthProvider({ children }: { children: React.ReactNode }) {
  const store = useAppModeStore();
  const { userStore } = useAuthContainer();
  const effectiveMode = store.getEffectiveMode(userStore.isGuest);
  const isLan = effectiveMode === "lan";

  const [initialOnline, setInitialOnline] = useState(true);
  const [initialChecked, setInitialChecked] = useState(false);

  useEffect(() => {
    if (isLan) return;
    healthLog.debug("server-health › immediate check start");
    checkBackEndHealth().then((ok) => {
      healthLog.info("server-health › immediate check result", { ok });
      setInitialOnline(ok);
      setInitialChecked(true);
    });
  }, [isLan]);

  const { online: pollOnline } = useHealthPoll(5000, !isLan);
  const online = isLan ? true : initialChecked ? pollOnline : initialOnline;

  healthLog.debug("server-health › status", { online, effectiveMode });

  return (
    <ServerHealthContext.Provider value={{ online }}>
      {children}
    </ServerHealthContext.Provider>
  );
}

export const useServerHealth = () => useContext(ServerHealthContext);
