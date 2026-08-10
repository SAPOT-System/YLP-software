import { useAuth } from "@/features/auth";
import { useAppMode } from "@/features/shared/core/context";
import type { HelpContext } from "../types";

export function useHelpContext(): HelpContext {
  const { store } = useAppMode();
  const { isGuest, isRescuer } = useAuth();
  return { mode: store.mode, isGuest, isRescuer };
}
