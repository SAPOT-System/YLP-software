import React, { createContext, useContext, useEffect, useState } from "react";
import { useAuthContainer } from "@/features/auth/hooks/use-auth-container";
import { checkBackEndHealth } from "../api/connection.api";
import { useHealthPoll } from "../hooks/use-health-poll";
import { useAppModeStore } from "./app-mode-context";

export type ServerHealthStatus = {
  online: boolean | null;
  initialChecked: boolean;
};

const ServerHealthContext = createContext<ServerHealthStatus>({
  online: true,
  initialChecked: false,
});

export function ServerHealthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const store = useAppModeStore();
  const { userStore } = useAuthContainer();
  const effectiveMode = store.getEffectiveMode(userStore.isGuest);
  const isLan = effectiveMode === "lan";

  const [initialChecked, setInitialChecked] = useState(false);


  useEffect(() => {
    if (isLan) {
      setInitialChecked(true);
      return;
    }
    checkBackEndHealth().then(() => {
      console.log("checked");
      setInitialChecked(true);
    });
  }, [isLan]);

  const { online: pollOnline } = useHealthPoll(5000, !isLan);
  const online = isLan ? true : initialChecked ? pollOnline : null;

  return (
    <ServerHealthContext.Provider value={{ online, initialChecked }}>
      {children}
    </ServerHealthContext.Provider>
  );
}

export const useServerHealth = () => useContext(ServerHealthContext);
