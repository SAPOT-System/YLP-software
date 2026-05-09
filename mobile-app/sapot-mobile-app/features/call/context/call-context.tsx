import { ChatRoomSource } from "@/features/chat/types";
import { Peer } from "@/features/shared/database/model/Peer";
import {
  useConnectionService,
} from "@/features/shared/hooks/use-connection-service";
import { usePeerService } from "@/features/shared/hooks/use-peer-service";
import { useProfilePhoto } from "@/features/shared/hooks/use-profile-photo";
import { CallEndedEventPayload } from "@/features/shared/services/connection-service";
import { callLog, uiLog } from "@/features/shared/utils/logger";
import { useRouter } from "expo-router";
import React, {
  createContext,
  RefObject,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { MediaStream } from "react-native-webrtc";
import { useCallService } from "../hooks/use-call-service";
import { AudioRouteTypes } from "../services/call-service";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type CallState =
  | "calling"
  | "answering"
  | "connected"
  | "ended"
  | "no-answer"
  | "busy";

export interface CallContextValue {
  // Call identity
  peerId: string | null;
  callType: "video" | "audio" | null;

  // Call state
  callState: CallState;
  elapsed: number;
  isMinimized: boolean;
  isMinimizedRef: RefObject<boolean>;
  ready: boolean;

  // Peer info
  peer: Peer | null;
  peerDisplayName: string;
  peerPhotoUrl: string | undefined | null;

  // Media
  localStream: MediaStream | undefined;
  remoteStreamUrl: string | undefined;

  // Media control state
  localMic: boolean;
  localCam: boolean;
  remoteMic: boolean;
  remoteCam: boolean;
  isFrontCamera: boolean;
  remoteStreamVersion: number;

  // Audio route
  currentRoute: AudioRouteTypes | undefined;

  // Actions
  resetCallState: (id: string, type: "video" | "audio") => Promise<void>;
  handleEndCall: () => Promise<void>;
  handleCallAgain: () => Promise<void>;
  handleToggleMic: () => void;
  handleToggleCam: () => void;
  handleVolume: () => void;
  handleSwitchCamera: () => Promise<void>;
  minimize: () => void;
  maximize: () => void;
  handleClose: () => void;
}

// ─────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────

const CallContext = createContext<CallContextValue | null>(null);

export function useCallContext(): CallContextValue {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCallContext must be used within CallProvider");
  return ctx;
}

// ─────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────

export function CallProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const callService = useCallService();
  const connectionService = useConnectionService();
  const peerService = usePeerService();

  // ── Call identity ──────────────────────────
  const [peerId, setPeerId] = useState<string | null>(null);
  const [callType, setCallType] = useState<"video" | "audio" | null>(null);

  // ── Call lifecycle ─────────────────────────
  const [callState, setCallState] = useState<CallState>("calling");
  const [elapsed, setElapsed] = useState(0);
  const [isMinimized, setIsMinimized] = useState(false);
  const hasTerminated = useRef(false);
  const hasSyncedMediaState = useRef(false);

  // ── Peer info ──────────────────────────────
  const [peer, setPeer] = useState<Peer | null>(null);
  const { url: peerPhotoUrl } = useProfilePhoto(peerId ?? "");

  const peerDisplayName = peer
    ? [peer.firstName, peer.lastName].filter(Boolean).join(" ")
    : "";

  // ── Media ──────────────────────────────────
  const [localStream, setLocalStream] = useState<MediaStream | undefined>();
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const [remoteStreamUrl, setRemoteStreamUrl] = useState<string | undefined>();
  const [ready, setReady] = useState(false);

  // ── Media controls ─────────────────────────
  const [localMic, setLocalMic] = useState(true);
  const [localCam, setLocalCam] = useState(true);
  const [remoteMic, setRemoteMic] = useState(true);
  const [remoteCam, setRemoteCam] = useState(true);
  const [remoteStreamVersion, setRemoteStreamVersion] = useState(0);
  const [isFrontCamera, setIsFrontCamera] = useState(true);

  // ── Audio route ────────────────────────────
  const currentRouteRef = useRef<AudioRouteTypes | undefined>(undefined);

  const isMinimizedRef = useRef(false);

  // ─────────────────────────────────────────────
  // Navigation helpers
  // ─────────────────────────────────────────────

  const navigateAway = useCallback(() => {
    router.replace("/(drawer)/(tabs)");
  }, [router]);

  const navigateToChat = useCallback(() => {
    if (!peerId) {
      router.replace("/(drawer)/(tabs)");
      return;
    }
    router.replace({
      pathname: "/(drawer)/(tabs)/chat/[id]" as never,
      params: { id: peerId, source: ChatRoomSource.PEER },
    });
  }, [router, peerId]);

  // ─────────────────────────────────────────────
  // Terminate
  // ─────────────────────────────────────────────

  const terminate = useCallback(
    async (force = false, reason?: "completed" | "missed" | "rejected") => {
      uiLog.debug("[CallContext] terminate called", {
        force,
        isMinimized,
        reason,
      });
      if (hasTerminated.current) return;
      // Do NOT terminate when merely minimizing, unless forced
      if (isMinimized && !force) {
        uiLog.debug("[CallContext] skipping terminate — call is minimized");
        return;
      }
      hasTerminated.current = true;
      try {
        await callService.terminateCallConnection(peerId as string, reason);
      } catch (error) {
        uiLog.error("[CallContext] Error in terminate", { error });
      }
    },
    [callService, peerId, isMinimized]
  );

  // ─────────────────────────────────────────────
  // Start outgoing call (called from outside, e.g. contact screen)
  // ─────────────────────────────────────────────

  const resetCallState = useCallback(
    async (id: string, type: "video" | "audio") => {
      uiLog.info("[CallContext] resetCallState", { id, type });

      // Reset everything for a fresh call
      setPeerId(id);
      setCallType(type);
      setCallState("calling");
      setElapsed(0);
      setLocalStream(undefined);
      setLocalCam(type === "video");
      setLocalMic(true);
      setRemoteMic(true);
      setRemoteCam(type === "video");
      setIsMinimized(false);
      hasTerminated.current = false;
      hasSyncedMediaState.current = false;
      remoteStreamRef.current = null;
      setRemoteStreamUrl(undefined);
      setReady(false);
    },
    []
  );

  // ─────────────────────────────────────────────
  // Audio route listener
  // ─────────────────────────────────────────────

  useEffect(() => {
    const audioRouteChangedHandler = ({
      route,
    }: {
      route: AudioRouteTypes;
    }) => {
      currentRouteRef.current = route;
    };

    callService.on("audio-route-changed", audioRouteChangedHandler);

    return () => {
      callService.off("audio-route-changed", audioRouteChangedHandler);
    };
  }, [callService]);

  // ─────────────────────────────────────────────
  // Connection service event listeners
  // (call-ready, mic/cam control signals from remote)
  // ─────────────────────────────────────────────

  useEffect(() => {
    if (!peerId || !callType) return;

    const callReadyHandler = (incomingPeerId: string) => {
      callLog.info("[CallContext] Call ready received");
      if (incomingPeerId !== peerId) {
        callLog.warn("[CallContext] Peer id does not match");
        return;
      }
      callLog.info("[CallContext] Starting call");
      callService.startCall(callType, peerId);
    };

    const micOnHandler = (incomingPeerId: string) => {
      if (peerId !== incomingPeerId) {
        uiLog.warn("[CallContext] mic-on rejected — peer mismatch");
        return;
      }
      callLog.info("[CallContext] Remote mic on");
      setRemoteMic(true);
    };

    const micOffHandler = (incomingPeerId: string) => {
      if (peerId !== incomingPeerId) {
        uiLog.warn("[CallContext] mic-off rejected — peer mismatch");
        return;
      }
      callLog.info("[CallContext] Remote mic off");
      setRemoteMic(false);
    };

    const camOnHandler = (incomingPeerId: string) => {
      if (peerId !== incomingPeerId) {
        uiLog.warn("[CallContext] camera-on rejected — peer mismatch");
        return;
      }
      callLog.info("[CallContext] Remote camera on");
      setRemoteCam(true);
    };

    const camOffHandler = (incomingPeerId: string) => {
      if (peerId !== incomingPeerId) {
        uiLog.warn("[CallContext] camera-off rejected — peer mismatch");
        return;
      }
      callLog.info("[CallContext] Remote camera off");
      setRemoteCam(false);
    };

    const callBusyHandler = (incomingPeerId: string, _payload: unknown) => {
      if (incomingPeerId !== peerId) {
        callLog.warn("[CallContext] call-busy rejected — peer mismatch", peerId);
        return;
      }
      if (connectionService.shouldIgnoreCallBusy(incomingPeerId)) {
        callLog.info("[CallContext] glare busy ignored", { peerId });
        return;
      }
      callLog.info("[CallContext] peer is busy", { peerId });
      setCallState("busy");
    };

    connectionService.on("call-ready", callReadyHandler);
    connectionService.on("mic-on", micOnHandler);
    connectionService.on("mic-off", micOffHandler);
    connectionService.on("camera-on", camOnHandler);
    connectionService.on("camera-off", camOffHandler);
    connectionService.on("call-busy", callBusyHandler);

    return () => {
      connectionService.off("call-ready", callReadyHandler);
      connectionService.off("mic-on", micOnHandler);
      connectionService.off("mic-off", micOffHandler);
      connectionService.off("camera-on", camOnHandler);
      connectionService.off("camera-off", camOffHandler);
      connectionService.off("call-busy", callBusyHandler);
    };
  }, [callService, connectionService, peerId, callType, terminate]);

  // ─────────────────────────────────────────────
  // Remote stream → call connected
  // ─────────────────────────────────────────────

  useEffect(() => {
    const handler = (stream: MediaStream) => {
      uiLog.info("[CallContext] remote stream received");
      remoteStreamRef.current = stream;
      setRemoteStreamUrl(stream.toURL());
      setCallState("connected");
      setRemoteStreamVersion((v) => v + 1);
    };

    callService.on("remoteStream", handler);

    return () => {
      callService.off("remoteStream", handler);
    };
  }, [callService]);

  // ─────────────────────────────────────────────
  // Sync local mic/cam state to peer on connect
  // (caller may have toggled before the call was answered)
  // ─────────────────────────────────────────────

  useEffect(() => {
    if (callState !== "connected" || !peerId) return;
    if (hasSyncedMediaState.current) return;
    hasSyncedMediaState.current = true;
    callService.syncMediaState(peerId, localMic, localCam);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callState, peerId, callService]);

  // ─────────────────────────────────────────────
  // Remote peer ending the call
  // ─────────────────────────────────────────────

  useEffect(() => {
    const handler = async (payload: CallEndedEventPayload) => {
      if (payload.peerId !== peerId) return;

      uiLog.info("[CallContext] call › remote ended", {
        peerId,
        status: payload.status,
        initiatorId: payload.initiatorId,
      });

      hasTerminated.current = true;
      try {
        await callService.handleRemoteCallEnded(peerId, {
          status: payload.status,
          endedAt: payload.endedAt,
          durationSeconds: payload.durationSeconds,
          initiatorId: payload.initiatorId,
          callType: payload.callType,
          messageId: payload.messageId,
          conversationId: payload.conversationId
        });
      } catch (error) {
        uiLog.error("[CallContext] Error in remote finalize", { error });
      }

      setCallState(payload.status === "missed" ? "no-answer" : "ended");
    };

    connectionService.on("call-ended", handler);

    return () => {
      connectionService.off("call-ended", handler);
    };
  }, [connectionService, peerId, terminate, callService]);

  // ─────────────────────────────────────────────
  // Ready flag for remote stream (small delay to let RTCView settle)
  // ─────────────────────────────────────────────

  useEffect(() => {
    if (remoteStreamRef) {
      const timer = setTimeout(() => setReady(true), 100);
      return () => clearTimeout(timer);
    }
  }, [remoteStreamRef]);

  // ─────────────────────────────────────────────
  // Debug: periodic remote stream health log
  // ─────────────────────────────────────────────

  useEffect(() => {
    if (!peerId) return;
    if (callState !== "connected") return; // ← only run during active call

    const interval = setInterval(() => {
      callLog.debug("[CallContext] remote stream health", {
        hasRemoteStream: !!remoteStreamRef.current,
        streamId: remoteStreamRef.current?.id,
        trackCount: remoteStreamRef.current?.getTracks().length,
        streamUrl: remoteStreamRef.current?.toURL(),
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [peerId, callState]);

  // ─────────────────────────────────────────────
  // Load peer info
  // ─────────────────────────────────────────────

  useEffect(() => {
    if (!peerId) return;
    uiLog.debug("[CallContext] loading peer", { peerId });
    peerService
      .findPeerById(peerId)
      .then((p: unknown) => setPeer(p as Peer))
      .catch((error) => {
        uiLog.error("[CallContext] Error in load peer", { error });
      });
  }, [peerId, peerService]);

  // ─────────────────────────────────────────────
  // Local stream (video calls)
  // ─────────────────────────────────────────────

  useEffect(() => {
    if (callType !== "video" || !peerId) return;
    uiLog.debug("[CallContext] getting local cam", { peerId });
    try {
      setLocalStream(callService.getLocalCam(peerId));
    } catch (error) {
      uiLog.error("[CallContext] Error in get local cam", { error });
    }
  }, [callService, peerId, callType]);

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

  useEffect(() => {
    if (!peerId) return;
    const handleSwitchCamEvent = (stream: MediaStream) => {
      uiLog.debug("[CallContext] switching local cam", { peerId });
      setLocalStream(stream);
    };
    callService.on("switch-cam", handleSwitchCamEvent);
    return () => {
      callService.off("switch-cam", handleSwitchCamEvent);
    };
  }, [callService, peerId, callType]);

  // Retry local stream if not available yet
  useEffect(() => {
    uiLog.debug("[CallContext] retry local cam check", {
      callType,
      callState,
      hasLocalStream: Boolean(localStream),
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
      if (attempts >= 5) {
        clearInterval(interval);
      }
    }, 800);

    return () => clearInterval(interval);
  }, [callType, callState, localStream, callService, peerId]);

  // ─────────────────────────────────────────────
  // Call timer
  // ─────────────────────────────────────────────

  useEffect(() => {
    uiLog.debug("[CallContext] timer effect", { callState });
    if (callState !== "connected") return;
    const interval = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [callState]);

  // ─────────────────────────────────────────────
  // No-answer timeout (30s)
  // ─────────────────────────────────────────────

  useEffect(() => {
    uiLog.debug("[CallContext] no-answer timeout effect", { callState });
    if (callState !== "calling") return;
    const timer = setTimeout(async () => {
      setCallState("no-answer");
      await terminate(true, "missed");
    }, 30_000);
    return () => clearTimeout(timer);
  }, [callState, terminate]);

  // ─────────────────────────────────────────────
  // Auto-navigate away on "ended" (3s delay)
  // ─────────────────────────────────────────────

  useEffect(() => {
    uiLog.debug("[CallContext] ended effect", { callState });
    if (callState !== "ended") return;
    uiLog.info("[CallContext] call › ended", { peerId });
    const timer = setTimeout(() => {
      uiLog.info("[CallContext] [Navigation] navigating to chat after ended");
      setIsMinimized(false);
      navigateToChat();
    }, 3000);
    return () => clearTimeout(timer);
  }, [callState, peerId, navigateToChat]);

  // ─────────────────────────────────────────────
  // Actions
  // ─────────────────────────────────────────────

  const handleEndCall = useCallback(async () => {
    uiLog.debug("[CallContext] handleEndCall called");
    setCallState("ended");
    await terminate(true);
  }, [terminate]);

  const handleCallAgain = useCallback(async () => {
    if (!peerId || !callType) return;
    uiLog.info("[CallContext] [Navigation] handleCallAgain", {
      peerId,
      callType,
    });
    try {
      await callService.informPeerForIncomingCall(callType, peerId);
      hasTerminated.current = false;
      setCallState("calling");
    } catch (error) {
      uiLog.error("[CallContext] Error in handleCallAgain", { error });
    }
  }, [peerId, callType, callService]);

  const handleToggleMic = useCallback(() => {
    uiLog.debug("[CallContext] handleToggleMic called", { localMic });
    try {
      callService.toggleMic(peerId as string);
      setLocalMic((v) => !v);
    } catch (error) {
      uiLog.error("[CallContext] Error in toggle localMic", { error });
    }
  }, [callService, peerId, localMic]);

  const handleToggleCam = useCallback(async () => {
    uiLog.debug("[CallContext] handleToggleCam called", { localCam });
    try {
      const cameraEnabled = await callService.toggleCamera(peerId as string);
      setLocalCam(cameraEnabled ?? !localCam);
      if (cameraEnabled) {
        try {
          const stream = callService.getLocalCam(peerId as string);
          if (stream) setLocalStream(stream);
        } catch {
          uiLog.warn("[CallContext] Error in getting camera");
        }
      }
    } catch (error) {
      uiLog.error("[CallContext] Error in toggle camera", { error });
    }
  }, [callService, peerId, localCam]);

  const handleVolume = useCallback(() => {
    uiLog.debug("[CallContext] handleVolume called");
    try {
      callService.toggleSpeaker();
    } catch (error) {
      uiLog.error("[CallContext] Error in toggle speaker", { error });
    }
  }, [callService]);

  const handleSwitchCamera = useCallback(async () => {
    uiLog.debug("[CallContext] handleSwitchCamera called");
    try {
      await callService.switchCamera(peerId as string, isFrontCamera);
      setIsFrontCamera((val) => !val);
    } catch (error) {
      uiLog.error("[CallContext] Error in toggle speaker", { error });
    }
  }, [callService, isFrontCamera, peerId]);

  const minimize = useCallback(() => {
    uiLog.info("[CallContext] minimize called");
    isMinimizedRef.current = true;
    setIsMinimized(true);
    navigateAway();
  }, [navigateAway]);

  const maximize = useCallback(() => {
    uiLog.info("[CallContext] maximize called");
    isMinimizedRef.current = false;
    setIsMinimized(false);
  }, []);

  const handleClose = useCallback(() => {
    uiLog.info("[CallContext] [Navigation] handleClose triggered");
    setIsMinimized(false);
    navigateAway();
  }, [navigateAway]);

  // ─────────────────────────────────────────────
  // Context value
  // ─────────────────────────────────────────────

  const value: CallContextValue = {
    peerId,
    callType,
    callState,
    elapsed,
    isMinimized,
    peer,
    peerDisplayName,
    peerPhotoUrl,
    localStream,
    remoteStreamUrl,
    localMic,
    localCam,
    remoteMic,
    remoteCam,
    isFrontCamera,
    remoteStreamVersion,
    currentRoute: currentRouteRef.current,
    isMinimizedRef,
    ready,
    resetCallState,
    handleEndCall,
    handleCallAgain,
    handleToggleMic,
    handleToggleCam,
    handleSwitchCamera,
    handleVolume,
    minimize,
    maximize,
    handleClose,
  };

  return (
    <CallContext.Provider value={value}>
      {children}
    </CallContext.Provider>
  );
}
