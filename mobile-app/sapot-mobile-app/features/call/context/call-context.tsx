import { ChatRoomSource } from "@/features/chat/types";
import { Peer } from "@/features/shared/database/model/Peer";
import { useConnectionService } from "@/features/shared/hooks/use-connection-service";
import { uiLog } from "@/features/shared/utils/logger";
import { useRouter } from "expo-router";
import React, {
  createContext,
  RefObject,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import { MediaStream } from "react-native-webrtc";
import { useCallService } from "../hooks/use-call-service";
import { AudioRouteTypes } from "../services/call-service";
import {
  useAudioRoute,
  useCallLifecycle,
  useCallMediaState,
  useCallTimer,
  useLocalStream,
  usePeerInfo,
  useRemoteStream,
} from "./hooks";
export type { CallState } from "./hooks";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface CallContextValue {
  // Call identity
  peerId: string | null;
  callType: "video" | "audio" | null;

  // Call state
  callState: import("./hooks").CallState;
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

  // Shell state
  const [peerId, setPeerId] = useState<string | null>(null);
  const [callType, setCallType] = useState<"video" | "audio" | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const isMinimizedRef = useRef(false);

  // Navigation helpers
  const navigateAway = useCallback(() => router.replace("/(drawer)/(tabs)"), [router]);
  const navigateToChat = useCallback(() => {
    if (!peerId) { router.replace("/(drawer)/(tabs)"); return; }
    router.replace({
      pathname: "/(drawer)/(tabs)/chat/[id]" as never,
      params: { id: peerId, source: ChatRoomSource.PEER },
    });
  }, [router, peerId]);

  const onCallEnded = useCallback(() => {
    uiLog.info("[CallContext] [Navigation] navigating to chat after ended");
    setIsMinimized(false);
    navigateToChat();
  }, [navigateToChat]);

  const { callState, setCallState, terminate, resetTerminated, resetLifecycle } =
    useCallLifecycle({ callService, connectionService, peerId, callType, isMinimized, onCallEnded });

  const { elapsed, resetElapsed } = useCallTimer(callState);
  const { peer, peerDisplayName, peerPhotoUrl } = usePeerInfo(peerId);
  const { currentRoute, handleVolume } = useAudioRoute(callService);
  const { localStream, refreshLocalCam, resetLocalStream } =
    useLocalStream({ callService, peerId, callType, callState });
  const onConnected = useCallback(() => setCallState("connected"), [setCallState]);
  const { remoteStreamUrl, remoteStreamVersion, ready, resetRemoteStream } =
    useRemoteStream({ callService, callState, peerId, onConnected });
  const {
    localMic, localCam, remoteMic, remoteCam, isFrontCamera,
    handleToggleMic, handleToggleCam, handleSwitchCamera, resetMedia,
  } = useCallMediaState({ callService, connectionService, peerId, callState, refreshLocalCam });

  // Reset (mirrors the original resetCallState exactly)
  const resetCallState = useCallback(async (id: string, type: "video" | "audio") => {
    uiLog.info("[CallContext] resetCallState", { id, type });
    setPeerId(id);
    setCallType(type);
    setIsMinimized(false);
    resetLifecycle();
    resetElapsed();
    resetMedia(type);
    resetLocalStream();
    resetRemoteStream();
  }, [resetLifecycle, resetElapsed, resetMedia, resetLocalStream, resetRemoteStream]);

  // Actions
  const handleEndCall = useCallback(async () => {
    setCallState("ended");
    await terminate(true);
  }, [setCallState, terminate]);

  const handleCallAgain = useCallback(async () => {
    if (!peerId || !callType) return;
    try {
      await callService.informPeerForIncomingCall(callType, peerId);
      resetTerminated();
      setCallState("calling");
    } catch (error) {
      uiLog.error("[CallContext] Error in handleCallAgain", { error });
    }
  }, [peerId, callType, callService, resetTerminated, setCallState]);

  const minimize = useCallback(() => {
    isMinimizedRef.current = true;
    setIsMinimized(true);
    navigateAway();
  }, [navigateAway]);

  const maximize = useCallback(() => {
    isMinimizedRef.current = false;
    setIsMinimized(false);
  }, []);

  const handleClose = useCallback(() => {
    setIsMinimized(false);
    navigateAway();
  }, [navigateAway]);

  const value: CallContextValue = {
    peerId, callType, callState, elapsed, isMinimized, peer, peerDisplayName, peerPhotoUrl,
    localStream, remoteStreamUrl, localMic, localCam, remoteMic, remoteCam, isFrontCamera,
    remoteStreamVersion, currentRoute, isMinimizedRef, ready,
    resetCallState, handleEndCall, handleCallAgain, handleToggleMic, handleToggleCam,
    handleSwitchCamera, handleVolume, minimize, maximize, handleClose,
  };

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}
