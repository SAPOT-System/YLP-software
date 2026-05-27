import { useAuthContainer } from "@/features/auth/hooks/use-auth-container";
import { PinEntryGate } from "@/features/auth/components/pin-entry-gate";
import React, { createContext, useEffect, useRef, useState } from "react";
import { ActivityIndicator } from "react-native-paper";
import { MainContainer, setPendingPIN } from "../main-container";
import { getPinEnabled } from "../stores/secure-config";
import { appLog } from "../utils/logger";
import { useAppModeStore } from "./app-mode-context";

appLog.debug("[main-container-context] module loaded");

export const MainContainerContext = createContext<MainContainer | null>(null);

export function MainContainerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const userContainer = useAuthContainer();
  const appModeStore = useAppModeStore();
  const [container, setContainer] = useState<MainContainer | null>(null);
  const [initFailed, setInitFailed] = useState(false);
  const [needsPin, setNeedsPin] = useState(false);
  const pendingContainerRef = useRef<MainContainer | null>(null);
  const containerRef = useRef<MainContainer | null>(null);

  useEffect(() => {
    setInitFailed(false);
    setNeedsPin(false);

    const init = async () => {
      try {
        appLog.info("app › container init start");
        const c = new MainContainer(userContainer, appModeStore);
        containerRef.current = c;

        const pinEnabled = await getPinEnabled();
        if (pinEnabled && !userContainer.userStore.isGuest) {
          pendingContainerRef.current = c;
          setNeedsPin(true);
          return;
        }

        await c.initialize();
        setContainer(c);
        appLog.info("app › container init complete");
      } catch (error) {
        appLog.error("app › container init failed", { error });
        setInitFailed(true);
      }
    };

    init();

    return () => {
      containerRef.current?.cleanup();
      containerRef.current = null;
      pendingContainerRef.current = null;
    };
  }, [appModeStore, userContainer]);

  const handlePinSubmit = async (pin: string): Promise<boolean> => {
    const c = pendingContainerRef.current;
    if (!c) return false;
    try {
      setPendingPIN(pin);
      await c.initialize();
      setNeedsPin(false);
      setContainer(c);
      pendingContainerRef.current = null;
      appLog.info("app › container init complete (PIN unlocked)");
      return true;
    } catch {
      appLog.warn("app › PIN unlock failed");
      return false;
    }
  };

  if (initFailed) {
    appLog.error("app › container failed to initialize — rendering children without container");
    return null;
  }

  if (needsPin) {
    return <PinEntryGate onSubmit={handlePinSubmit} />;
  }

  if (!container) {
    return <ActivityIndicator />;
  }

  return (
    <MainContainerContext.Provider value={container}>
      {children}
    </MainContainerContext.Provider>
  );
}
