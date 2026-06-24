import type { CallService } from "@/features/call/services/call-service";
import type { ConnectionService } from "@/features/shared/services/connection-service";
import { hookLog, uiLog } from "@/features/shared/utils/logger";
import { useCallback, useEffect, useRef, useState } from "react";

hookLog.debug("[use-call-media-state] module loaded");

// Temporary local type for isolated development; replaced by the shared
// import from ./use-call-lifecycle in Task 8.
type CallState =
  | "calling" | "answering" | "connected"
  | "reconnecting" | "ended" | "no-answer" | "busy";

export function useCallMediaState(params: {
  callService: CallService;
  connectionService: ConnectionService;
  peerId: string | null;
  callState: CallState;
  refreshLocalCam: () => void;
}): {
  localMic: boolean; localCam: boolean; remoteMic: boolean; remoteCam: boolean;
  isFrontCamera: boolean;
  handleToggleMic: () => void;
  handleToggleCam: () => Promise<void>;
  handleSwitchCamera: () => Promise<void>;
  resetMedia: (type: "video" | "audio") => void;
} {
  const { callService, connectionService, peerId, callState, refreshLocalCam } = params;

  const [localMic, setLocalMic] = useState(true);
  const [localCam, setLocalCam] = useState(true);
  const [remoteMic, setRemoteMic] = useState(true);
  const [remoteCam, setRemoteCam] = useState(true);
  const [isFrontCamera, setIsFrontCamera] = useState(true);
  const hasSyncedMediaState = useRef(false);

  // Remote mic/cam control signals + reconnect re-sync flag reset
  useEffect(() => {
    if (!peerId) return;
    const micOn = (id: string) => { if (id === peerId) setRemoteMic(true); };
    const micOff = (id: string) => { if (id === peerId) setRemoteMic(false); };
    const camOn = (id: string) => { if (id === peerId) setRemoteCam(true); };
    const camOff = (id: string) => { if (id === peerId) setRemoteCam(false); };
    const onReconnecting = (id: string) => {
      if (id !== peerId) return;
      hasSyncedMediaState.current = false; // allow re-sync when connection restores
    };
    connectionService.on("mic-on", micOn);
    connectionService.on("mic-off", micOff);
    connectionService.on("camera-on", camOn);
    connectionService.on("camera-off", camOff);
    connectionService.on("call-reconnecting", onReconnecting);
    return () => {
      connectionService.off("mic-on", micOn);
      connectionService.off("mic-off", micOff);
      connectionService.off("camera-on", camOn);
      connectionService.off("camera-off", camOff);
      connectionService.off("call-reconnecting", onReconnecting);
    };
  }, [connectionService, peerId]);

  // Sync local mic/cam to peer on connect (once)
  useEffect(() => {
    if (callState !== "connected" || !peerId) return;
    if (hasSyncedMediaState.current) return;
    hasSyncedMediaState.current = true;
    callService.syncMediaState(peerId, localMic, localCam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callState, peerId, callService]);

  const handleToggleMic = useCallback(() => {
    try {
      callService.toggleMic(peerId as string);
      setLocalMic((v) => !v);
    } catch (error) {
      uiLog.error("[CallContext] Error in toggle localMic", { error });
    }
  }, [callService, peerId]);

  const handleToggleCam = useCallback(async () => {
    try {
      const cameraEnabled = await callService.toggleCamera(peerId as string);
      setLocalCam((prev) => cameraEnabled ?? !prev);
      if (cameraEnabled) refreshLocalCam();
    } catch (error) {
      uiLog.error("[CallContext] Error in toggle camera", { error });
    }
  }, [callService, peerId, refreshLocalCam]);

  const handleSwitchCamera = useCallback(async () => {
    try {
      await callService.switchCamera(peerId as string, isFrontCamera);
      setIsFrontCamera((v) => !v);
    } catch (error) {
      uiLog.error("[CallContext] Error in switch camera", { error });
    }
  }, [callService, isFrontCamera, peerId]);

  const resetMedia = useCallback((type: "video" | "audio") => {
    setLocalCam(type === "video");
    setLocalMic(true);
    setRemoteMic(true);
    setRemoteCam(type === "video");
    hasSyncedMediaState.current = false;
  }, []);

  return {
    localMic, localCam, remoteMic, remoteCam, isFrontCamera,
    handleToggleMic, handleToggleCam, handleSwitchCamera, resetMedia,
  };
}
