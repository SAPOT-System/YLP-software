import React, { createContext, useContext, useEffect, useState } from "react";
import { checkBackEndHealth } from "../api/connection.api";
import { healthLog } from "../utils/logger";
healthLog.debug("[health-context] module loaded");

const HealthContext = createContext<boolean>(false);

export const HealthProvider = ({ children }: { children: React.ReactNode }) => {
  const [health, setHealth] = useState<boolean>(false);

  useEffect(() => {
    const check = async () => {
      try {
        healthLog.debug("health › check start");
        const ok = await checkBackEndHealth();
        setHealth(ok);
        healthLog.info("health › check result", { ok });
      } catch (error) {
        healthLog.warn("health › check failed", { error });
        setHealth(false);
      }
    };
    check();
  }, []);

  return (
    <HealthContext.Provider value={health}>{children}</HealthContext.Provider>
  );
};

export const useHealth = () => useContext(HealthContext);
