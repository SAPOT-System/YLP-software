import { useEffect, useRef } from "react";
import { InteractionManager } from "react-native";
import { useTour } from "../context/tour-context";
import { shouldAutostartTour } from "../services/tour-persistence";

export function useTourAutostart(enabled: boolean): void {
  const { start, status } = useTour(); const attempted = useRef(false);
  useEffect(() => { if (!enabled || attempted.current || status !== "idle") return; attempted.current = true; let cancelled = false; const task = InteractionManager.runAfterInteractions(async () => { if (await shouldAutostartTour() && !cancelled) await start(); }); return () => { cancelled = true; task.cancel(); }; }, [enabled, start, status]);
}
