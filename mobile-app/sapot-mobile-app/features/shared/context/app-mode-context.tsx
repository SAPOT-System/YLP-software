import React, { createContext, useContext, useMemo, useSyncExternalStore } from "react";
import { AppMode, AppModeStore } from "../stores/app-mode-store";
import { modeLog } from "../utils/logger";
modeLog.debug("[app-mode-context] module loaded");

const AppModeContext = createContext<AppModeStore | null>(null);

export function AppModeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const store = useMemo(() => new AppModeStore(), []);

  return (
    <AppModeContext.Provider value={store}>
      {children}
    </AppModeContext.Provider>
  );
}

export function useAppModeStore() {
  const store = useContext(AppModeContext);
  if (!store) {
    throw new Error("useAppModeStore must be used within AppModeProvider");
  }

  return store;
}

export function useAppMode() {
  const store = useAppModeStore();
  const mode = useSyncExternalStore(
    store.subscribe.bind(store),
    () => store.mode,
    () => store.mode
  );

  const setMode = (nextMode: AppMode) => {
    modeLog.info("mode › set", { from: store.mode, to: nextMode });
    store.setMode(nextMode);
  };

  return {
    mode,
    setMode,
    store,
  };
}
