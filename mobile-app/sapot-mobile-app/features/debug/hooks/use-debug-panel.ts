import { useSyncExternalStore } from "react";
import { debugPanelStore } from "../stores/debug-panel-store";

export function useDebugPanel() {
  const isOpen = useSyncExternalStore(
    (listener) => debugPanelStore.subscribe(listener),
    () => debugPanelStore.isOpen,
    () => debugPanelStore.isOpen
  );

  return {
    isOpen,
    open: () => debugPanelStore.open(),
    close: () => debugPanelStore.close(),
    toggle: () => debugPanelStore.toggle(),
  };
}
