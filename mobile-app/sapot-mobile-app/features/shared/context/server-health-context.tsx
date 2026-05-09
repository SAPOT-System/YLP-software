import React, { createContext, useContext, useEffect, useState } from "react";
import { checkBackEndHealth } from "../api/connection.api";
import { useHealthPoll } from "../hooks/use-health-poll";
import { healthLog } from "../utils/logger";
healthLog.debug("[server-health-context] module loaded");

export type ServerHealthStatus = {
  online: boolean;
};

const ServerHealthContext = createContext<ServerHealthStatus>({ online: true });

export function ServerHealthProvider({ children }: { children: React.ReactNode }) {
  const [initialOnline, setInitialOnline] = useState(true);
  const [initialChecked, setInitialChecked] = useState(false);

  useEffect(() => {
    healthLog.debug("server-health › immediate check start");
    checkBackEndHealth().then((ok) => {
      healthLog.info("server-health › immediate check result", { ok });
      setInitialOnline(ok);
      setInitialChecked(true);
    });
  }, []);

  const { online: pollOnline } = useHealthPoll();
  const online = initialChecked ? pollOnline : initialOnline;

  healthLog.debug("server-health › status", { online });

  return (
    <ServerHealthContext.Provider value={{ online }}>
      {children}
    </ServerHealthContext.Provider>
  );
}

export const useServerHealth = () => useContext(ServerHealthContext);
