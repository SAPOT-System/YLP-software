import type { CallService } from "@/features/call/services/call-service";
import { hookLog, uiLog } from "@/features/shared/utils/logger";
import { useCallback, useEffect, useState } from "react";
import { MediaStream } from "react-native-webrtc";
import type { CallState } from "./use-call-lifecycle";

hookLog.debug("[use-local-stream] module loaded");

export function useLocalStream(params: {
  callService: CallService;
  peerId: string | null;
  callType: "video" | "audio" | null;
  callState: CallState;
}): {
  localStream: MediaStream | undefined;
  setLocalStream: (s: MediaStream | undefined) => void;
  refreshLocalCam: () => void;
  resetLocalStream: () => void;
} {
  const { callService, peerId, callType, callState } = params;
  const [localStream, setLocalStream] = useState<MediaStream | undefined>();

  const refreshLocalCam = useCallback(() => {
    if (!peerId) return;
    try {
      const stream = callService.getLocalCam(peerId);
      if (stream) setLocalStream(stream);
    } catch (error) {
      uiLog.warn("[CallContext] Error refreshing local cam", { error });
    }
  }, [callService, peerId]);

  const resetLocalStream = useCallback(() => setLocalStream(undefined), []);

  // Initial local stream for video calls
  useEffect(() => {
    if (callType !== "video" || !peerId) return;
    uiLog.debug("[CallContext] getting local cam", { peerId });
    try {
      setLocalStream(callService.getLocalCam(peerId));
    } catch (error) {
      uiLog.error("[CallContext] Error in get local cam", { error });
    }
  }, [callService, peerId, callType]);

  // local-stream-ready listener
  useEffect(() => {
    if (!peerId) return;
    const handler = (incomingPeerId: string) => {
      if (incomingPeerId !== peerId) return;
      uiLog.debug("[CallContext] local-stream-ready received", { peerId });
      try {
        setLocalStream(callService.getLocalCam(peerId));
      } catch (error) {
        uiLog.error("[CallContext] Error getting local cam after early init", { error });
      }
    };
    callService.on("local-stream-ready", handler);
    return () => {
      callService.off("local-stream-ready", handler);
    };
  }, [callService, peerId]);

  // switch-cam listener
  useEffect(() => {
    if (!peerId) return;
    const handler = (stream: MediaStream) => {
      uiLog.debug("[CallContext] switching local cam", { peerId });
      setLocalStream(stream);
    };
    callService.on("switch-cam", handler);
    return () => {
      callService.off("switch-cam", handler);
    };
  }, [callService, peerId, callType]);

  // Retry local stream if not available yet (connected only)
  useEffect(() => {
    uiLog.debug("[CallContext] retry local cam check", {
      callType, callState, hasLocalStream: Boolean(localStream),
    });
    if (callState !== "connected" || localStream || !peerId) return;
    let attempts = 0;
    const interval = setInterval(() => {
      attempts += 1;
      try {
        const stream = callService.getLocalCam(peerId);
        if (stream) {
          setLocalStream(stream);
          clearInterval(interval);
          return;
        }
      } catch (error) {
        uiLog.error("[CallContext] Error in retry local cam", { error });
      }
      if (attempts >= 5) clearInterval(interval);
    }, 800);
    return () => clearInterval(interval);
  }, [callType, callState, localStream, callService, peerId]);

  return { localStream, setLocalStream, refreshLocalCam, resetLocalStream };
}
