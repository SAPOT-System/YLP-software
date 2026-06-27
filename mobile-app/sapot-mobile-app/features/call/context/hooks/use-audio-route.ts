import type { AudioRouteTypes, CallService } from "@/features/call/services/call-service";
import { hookLog, uiLog } from "@/features/shared/core/utils/logger";
import { useCallback, useEffect, useRef } from "react";

hookLog.debug("[use-audio-route] module loaded");

export function useAudioRoute(callService: CallService): {
  currentRoute: AudioRouteTypes | undefined;
  handleVolume: () => void;
} {
  const currentRouteRef = useRef<AudioRouteTypes | undefined>(undefined);

  useEffect(() => {
    const handler = ({ route }: { route: AudioRouteTypes }) => {
      currentRouteRef.current = route;
    };
    callService.on("audio-route-changed", handler);
    return () => {
      callService.off("audio-route-changed", handler);
    };
  }, [callService]);

  const handleVolume = useCallback(() => {
    uiLog.debug("[CallContext] handleVolume called");
    try {
      callService.toggleSpeaker();
    } catch (error) {
      uiLog.error("[CallContext] Error in toggle speaker", { error });
    }
  }, [callService]);

  return { currentRoute: currentRouteRef.current, handleVolume };
}
