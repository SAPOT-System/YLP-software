import React, { createContext, useContext, useState, useEffect } from "react";
import { checkBackEndHealth } from "@/features/shared";

const HealthContext = createContext<boolean>(false);

export const HealthProvider = ({ children }: { children: React.ReactNode }) => {
  const [health, setHealth] = useState<boolean>(false);

  useEffect(() => {
    const check = async () => {
      setHealth(await checkBackEndHealth());
    };
    check();
  }, []);

  return (
    <HealthContext.Provider value={health}>{children}</HealthContext.Provider>
  );
};

export const useHealth = () => useContext(HealthContext);
