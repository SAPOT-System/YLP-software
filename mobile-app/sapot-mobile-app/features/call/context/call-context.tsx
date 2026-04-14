import { AudioRouteTypes, useCallService } from "@/features/call";
import { Peer } from "@/features/shared/database/model/Peer";
import {
  useConnectionService,
  usePeerService,
  useProfilePhoto,
} from "@/features/shared/hooks";
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
import { CallBanner } from "../components/call-banner";

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

  // Audio route
  currentRoute: AudioRouteTypes | undefined;

  // Actions
  resetCallState: (id: string, type: "video" | "audio") => Promise<void>;
  handleEndCall: () => Promise<void>;
  handleCallAgain: () => Promise<void>;
  handleToggleMic: () => void;
  handleToggleCam: () => void;
  handleVolume: () => void;
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

  // ── Audio route ────────────────────────────
  const currentRouteRef = useRef<AudioRouteTypes | undefined>(undefined);

  const isMinimizedRef = useRef(false);

  // ─────────────────────────────────────────────
  // Navigation helpers
  // ─────────────────────────────────────────────

  const navigateAway = useCallback(() => {
    router.replace("/(drawer)/(tabs)");
  }, [router]);

  // ─────────────────────────────────────────────
  // Terminate
  // ─────────────────────────────────────────────

  const terminate = useCallback(
    async (force = false) => {
      uiLog.debug("[CallContext] terminate called", { force, isMinimized });
      if (hasTerminated.current) return;
      // Do NOT terminate when merely minimizing, unless forced
      if (isMinimized && !force) {
        uiLog.debug("[CallContext] skipping terminate — call is minimized");
        return;
      }
      hasTerminated.current = true;
      try {
        await callService.terminateCallConnection(peerId as string);
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
      uiLog.info("[CallContext] startOutgoingCall", { id, type });

      // Reset everything for a fresh call
      setPeerId(id);
      setCallType(type);
      setCallState("calling");
      setElapsed(0);
      setLocalStream(undefined);
      setLocalCam(true);
      setLocalMic(true);
      setRemoteMic(true);
      setRemoteCam(true);
      setIsMinimized(false);
      hasTerminated.current = false;
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

    connectionService.on("call-ready", callReadyHandler);
    connectionService.on("mic-on", micOnHandler);
    connectionService.on("mic-off", micOffHandler);
    connectionService.on("camera-on", camOnHandler);
    connectionService.on("camera-off", camOffHandler);

    return () => {
      connectionService.off("call-ready", callReadyHandler);
      connectionService.off("mic-on", micOnHandler);
      connectionService.off("mic-off", micOffHandler);
      connectionService.off("camera-on", camOnHandler);
      connectionService.off("camera-off", camOffHandler);
    };
  }, [callService, connectionService, peerId, callType]);

  // ─────────────────────────────────────────────
  // Remote stream → call connected
  // ─────────────────────────────────────────────

  useEffect(() => {
    const handler = (stream: MediaStream) => {
      uiLog.info("[CallContext] remote stream received");
      remoteStreamRef.current = stream;
      setRemoteStreamUrl(stream.toURL());
      setCallState("connected");
    };

    callService.on("remoteStream", handler);

    return () => {
      callService.off("remoteStream", handler);
    };
  }, [callService]);

  // ─────────────────────────────────────────────
  // Remote peer ending the call
  // ─────────────────────────────────────────────

  useEffect(() => {
    const handler = async (fromId?: string) => {
      if (fromId && fromId !== peerId) return;
      uiLog.info("[CallContext] call › remote ended", { peerId });
      await terminate(true);
      setCallState("ended");
    };

    connectionService.on("call-ended", handler);

    return () => {
      connectionService.off("call-ended", handler);
    };
  }, [connectionService, peerId, terminate]);

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

  // Retry local stream if not available yet
  useEffect(() => {
    uiLog.debug("[CallContext] retry local cam check", {
      callType,
      callState,
      hasLocalStream: Boolean(localStream),
    });
    if (
      callType !== "video" ||
      callState !== "connected" ||
      localStream ||
      !peerId
    )
      return;

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
    const timer = setTimeout(() => setCallState("no-answer"), 30_000);
    return () => clearTimeout(timer);
  }, [callState]);

  // ─────────────────────────────────────────────
  // Auto-navigate away on "ended" (3s delay)
  // ─────────────────────────────────────────────

  useEffect(() => {
    uiLog.debug("[CallContext] ended effect", { callState });
    if (callState !== "ended") return;
    uiLog.info("[CallContext] call › ended", { peerId });
    const timer = setTimeout(() => {
      uiLog.info("[CallContext] [Navigation] navigating away after ended");
      setIsMinimized(false);
      navigateAway();
    }, 3000);
    return () => clearTimeout(timer);
  }, [callState, peerId, navigateAway]);

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

  const handleToggleCam = useCallback(() => {
    uiLog.debug("[CallContext] handleToggleCam called", { localCam });
    try {
      callService.toggleCamera(peerId as string);
      setLocalCam((v) => !v);
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
    currentRoute: currentRouteRef.current,
    isMinimizedRef,
    ready,
    resetCallState,
    handleEndCall,
    handleCallAgain,
    handleToggleMic,
    handleToggleCam,
    handleVolume,
    minimize,
    maximize,
    handleClose,
  };

  return (
    <CallContext.Provider value={value}>
      {children}
      <CallBanner />
    </CallContext.Provider>
  );
}
