import { useCallService } from "@/features/call";
import { Peer } from "@/features/shared/database/model/Peer";
import {
  useConnectionService,
  usePeerService,
  useProfilePhoto,
} from "@/features/shared/hooks";
import { uiLog } from "@/features/shared/utils/logger";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MediaStream, RTCView } from "react-native-webrtc";

type CallState = "calling" | "connected" | "ended" | "no-answer" | "busy";

const COLORS = {
  primary: "#103462",
  gradStart: "#99AEC7",
  gradEnd: "#FFFFFF",
  controlBg: "rgba(153, 174, 199, 0.25)",
  buttonBg: "#d9d9d9",
  acceptGreen: "#34A853",
  declineRed: "#EA4335",
};

const formatDuration = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

export default function CallRoom() {
  const router = useRouter();
  const { id, type, status } = useLocalSearchParams<{
    id: string;
    type: string;
    status?: string;
  }>();
  const callService = useCallService();
  const connectionService = useConnectionService();
  const peerService = usePeerService();

  const [callState, setCallState] = useState<CallState>(
    status === "connected" ? "connected" : "calling"
  );
  uiLog.debug("call › state updated", { callState });
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(true);
  const [peer, setPeer] = useState<Peer | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [localStream, setLocalStream] = useState<MediaStream | undefined>();
  const [remoteStream, setRemoteStream] = useState<MediaStream | undefined>();
  const hasTerminated = useRef(false);

  const localStreamUrl = localStream ? localStream.toURL() : undefined;
  const remoteStreamUrl = remoteStream ? remoteStream.toURL() : undefined;

  const { url: peerPhotoUrl } = useProfilePhoto(id);

  const peerDisplayName = peer
    ? [peer.firstName, peer.lastName].filter(Boolean).join(" ")
    : "";

  useEffect(() => {
    uiLog.info("[CallRoom] mounted");
    return () => {
      uiLog.info("[CallRoom] unmounted");
    };
  }, []);

  // Reset state when the screen gains focus
  useFocusEffect(
    useCallback(() => {
      uiLog.debug("[CallRoom] useFocusEffect triggered, deps:", {
        id,
        type,
        status,
      });
      setCallState(status === "connected" ? "connected" : "calling");
      setElapsed(0);
      setLocalStream(undefined);
      setRemoteStream(undefined);
      setMic(true);
      setCam(true);
      hasTerminated.current = false;
    }, [id, type, status])
  );

  // Load peer info
  useEffect(() => {
    uiLog.debug("[CallRoom] useEffect triggered, deps:", { id });
    peerService
      .findPeerById(id as string)
      .then((p: unknown) => setPeer(p as Peer))
      .catch((error) => {
        uiLog.error("[CallRoom] Error in load peer", { error });
      });
  }, [id, peerService]);

  // Timer for ongoing call
  useEffect(() => {
    uiLog.debug("[CallRoom] useEffect triggered, deps:", { callState });
    if (callState !== "connected") return;
    const interval = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [callState]);

  // Get local stream for video calls
  useEffect(() => {
    uiLog.debug("[CallRoom] useEffect triggered, deps:", { type });
    if (type !== "video") return;
    try {
      setLocalStream(callService.getLocalCam(id as string));
    } catch (error) {
      uiLog.error("[CallRoom] Error in get local cam", { error });
    }
  }, [callService, id, type]);

  // Retry fetching local stream if not available yet
  useEffect(() => {
    uiLog.debug("[CallRoom] useEffect triggered, deps:", {
      type,
      callState,
      hasLocalStream: Boolean(localStream),
    });
    if (type !== "video" || callState !== "connected" || localStream) return;
    let attempts = 0;
    const interval = setInterval(() => {
      attempts += 1;
      try {
        const stream = callService.getLocalCam(id as string);
        if (stream) {
          setLocalStream(stream);
          clearInterval(interval);
          return;
        }
      } catch (error) {
        uiLog.error("[CallRoom] Error in retry local cam", { error });
      }
      if (attempts >= 5) {
        clearInterval(interval);
      }
    }, 800);
    return () => clearInterval(interval);
  }, [type, callState, localStream, callService, id]);

  // Listen for remote stream → call connected
  useEffect(() => {
    const handler = (stream: MediaStream) => {
      uiLog.info("[CallRoom] remote stream received");
      setRemoteStream(stream);
      setCallState("connected");
    };
    callService.on("remoteStream", handler);
    return () => {
      callService.off("remoteStream", handler);
    };
  }, [callService]);

  // Listen for remote peer ending the call
  useEffect(() => {
    const handler = (fromId?: string) => {
      if (fromId && fromId !== id) return;
      uiLog.info("call › remote ended", { peerId: id });
      setCallState((prev) => (prev === "calling" ? "no-answer" : "ended"));
    };
    connectionService.on("call-ended", handler);
    return () => {
      connectionService.off("call-ended", handler);
    };
  }, [connectionService, id]);

  // No-answer timeout (30s)
  useEffect(() => {
    uiLog.debug("[CallRoom] useEffect triggered, deps:", { callState });
    if (callState !== "calling") return;
    const timer = setTimeout(() => setCallState("no-answer"), 30_000);
    return () => clearTimeout(timer);
  }, [callState]);

  // Auto-navigate back from terminal states after a delay
  useEffect(() => {
    uiLog.debug("[CallRoom] useEffect triggered, deps:", { callState });
    if (callState !== "ended") return;
    uiLog.info("call › ended", { peerId: id });
    const timer = setTimeout(() => {
      uiLog.info("[Navigation] goBack triggered from CallRoom");
      router.back();
    }, 3000);
    return () => clearTimeout(timer);
  }, [callState, router, id]);

  // Terminate on unmount if still active
  useEffect(() => {
    return () => {
      if (!hasTerminated.current) {
        callService.terminateCallConnection(id as string).catch((error) => {
          uiLog.error("[CallRoom] Error in terminate on unmount", { error });
        });
      }
    };
  }, [callService, id]);

  const terminate = useCallback(async () => {
    uiLog.debug("[CallRoom] terminate called");
    if (hasTerminated.current) return;
    hasTerminated.current = true;
    try {
      await callService.terminateCallConnection(id as string);
    } catch (error) {
      uiLog.error("[CallRoom] Error in terminate", { error });
    }
  }, [callService, id]);

  const handleEndCall = useCallback(async () => {
    uiLog.debug("[CallRoom] handleEndCall called");
    await terminate();
    setCallState("ended");
  }, [terminate]);

  const handleClose = useCallback(() => {
    uiLog.info("[Navigation] goBack triggered from CallRoom");
    router.back();
  }, [router]);

  const handleCallAgain = useCallback(() => {
    uiLog.info("[Navigation] Navigating to CallRoom", {
      screen: "/(drawer)/(tabs)/call/[id]",
      peerId: id,
      type,
      status: "calling",
    });
    router.replace({
      pathname: "/(drawer)/(tabs)/call/[id]" as never,
      params: { id: id!, type, status: "calling" },
    });
  }, [router, id, type]);

  const handleToggleMic = useCallback(() => {
    uiLog.debug("[CallRoom] handleToggleMic called", { mic });
    try {
      callService.toggleMic(id as string);
      setMic((v) => !v);
    } catch (error) {
      uiLog.error("[CallRoom] Error in toggle mic", { error });
    }
  }, [callService, id, mic]);

  const handleToggleCam = useCallback(() => {
    uiLog.debug("[CallRoom] handleToggleCam called", { cam });
    try {
      callService.toggleCamera(id as string);
      setCam((v) => !v);
    } catch (error) {
      uiLog.error("[CallRoom] Error in toggle camera", { error });
    }
  }, [callService, id, cam]);

  const isActive = callState === "calling" || callState === "connected";
  const showVideoStreams = type === "video" && callState === "connected";

  return (
    <LinearGradient
      colors={[COLORS.gradStart, COLORS.gradEnd]}
      start={{ x: 0, y: 1 }}
      end={{ x: 0, y: 0 }}
      style={styles.container}
    >
      {/* Back button (shown when connected) */}
      {callState === "connected" && (
        <TouchableOpacity style={styles.backButton} onPress={handleClose}>
          <Feather name="chevron-left" size={28} color={COLORS.primary} />
        </TouchableOpacity>
      )}

      {/* Peer section */}
      <View style={styles.peerSection}>
        <View style={styles.avatarWrap}>
          {peerPhotoUrl ? (
            <Image source={{ uri: peerPhotoUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarInitial}>
                {peerDisplayName ? peerDisplayName[0].toUpperCase() : "?"}
              </Text>
            </View>
          )}
        </View>
        <Text style={styles.peerName}>{peerDisplayName}</Text>
      </View>

      {/* Status / Timer */}
      <Text style={styles.statusText}>
        {callState === "calling" && "Calling..."}
        {callState === "connected" && formatDuration(elapsed)}
        {callState === "ended" && "Call ended"}
        {callState === "no-answer" && "Did not answer"}
        {callState === "busy" && `${peerDisplayName} is in another call`}
      </Text>

      {/* Video streams (video call, connected state) */}
      {showVideoStreams && (
        <View style={styles.videoContainer}>
          {remoteStreamUrl ? (
            <RTCView
              streamURL={remoteStreamUrl}
              mirror={false}
              objectFit="cover"
              zOrder={0}
              style={styles.remoteVideo}
            />
          ) : (
            <View style={styles.remoteVideo} />
          )}
          {localStreamUrl && (
            <RTCView
              streamURL={localStreamUrl}
              mirror={true}
              objectFit="cover"
              zOrder={1}
              style={styles.localVideo}
            />
          )}
        </View>
      )}

      {/* Controls row (calling or connected) */}
      {isActive && (
        <View style={styles.controls}>
          <View style={styles.controlRow}>
            <TouchableOpacity
              style={[styles.controlBtn, !mic && styles.controlBtnOff]}
              onPress={handleToggleMic}
            >
              <Feather
                name={mic ? "mic" : "mic-off"}
                size={22}
                color={COLORS.primary}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.controlBtn, !cam && styles.controlBtnOff]}
              onPress={handleToggleCam}
            >
              <Feather
                name={cam ? "video" : "video-off"}
                size={22}
                color={COLORS.primary}
              />
            </TouchableOpacity>
            <TouchableOpacity style={styles.controlBtn}>
              <Feather name="volume-2" size={22} color={COLORS.primary} />
            </TouchableOpacity>
          </View>

          {/* End call button */}
          <View style={styles.actionRow}>
            <View style={styles.actionItem}>
              <TouchableOpacity
                style={styles.endCallBtn}
                onPress={handleEndCall}
              >
                <Feather name="phone-off" size={28} color={COLORS.declineRed} />
              </TouchableOpacity>
              <Text style={styles.actionLabel}>End Call</Text>
            </View>
          </View>
        </View>
      )}

      {/* Did not answer actions */}
      {callState === "no-answer" && (
        <View style={styles.controls}>
          <View style={styles.actionRow}>
            <View style={styles.actionItem}>
              <TouchableOpacity style={styles.actionBtn} onPress={handleClose}>
                <Feather name="x" size={28} color={COLORS.primary} />
              </TouchableOpacity>
              <Text style={styles.actionLabel}>Close</Text>
            </View>
            <View style={styles.actionItem}>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={handleCallAgain}
              >
                <Feather name="phone" size={28} color={COLORS.acceptGreen} />
              </TouchableOpacity>
              <Text style={styles.actionLabel}>Call again</Text>
            </View>
          </View>
        </View>
      )}

      {/* Busy actions */}
      {callState === "busy" && (
        <View style={styles.controls}>
          <View style={styles.actionRow}>
            <View style={styles.actionItem}>
              <TouchableOpacity style={styles.actionBtn} onPress={handleClose}>
                <Feather name="x" size={28} color={COLORS.primary} />
              </TouchableOpacity>
              <Text style={styles.actionLabel}>Close</Text>
            </View>
          </View>
        </View>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backButton: {
    position: "absolute",
    top: 70,
    left: 24,
    width: 35,
    height: 35,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  peerSection: {
    alignItems: "center",
    marginTop: 160,
  },
  avatarWrap: {
    width: 169,
    height: 169,
    borderRadius: 84.5,
    overflow: "hidden",
    marginBottom: 16,
  },
  avatar: {
    width: 169,
    height: 169,
    borderRadius: 84.5,
  },
  avatarFallback: {
    backgroundColor: "rgba(153, 174, 199, 0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontSize: 64,
    fontWeight: "300",
    color: "#103462",
  },
  peerName: {
    fontSize: 25,
    color: "#103462",
    textAlign: "center",
    marginTop: 4,
  },
  statusText: {
    fontSize: 30,
    color: "#103462",
    textAlign: "center",
    marginTop: 28,
    paddingHorizontal: 24,
  },
  videoContainer: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  remoteVideo: {
    flex: 1,
    backgroundColor: "#000",
  },
  localVideo: {
    position: "absolute",
    bottom: 16,
    right: 16,
    width: 100,
    height: 150,
    borderRadius: 10,
    backgroundColor: "#1a1a2e",
    zIndex: 2,
  },
  controls: {
    position: "absolute",
    bottom: 60,
    left: 0,
    right: 0,
    alignItems: "center",
    gap: 48,
  },
  controlRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 40,
  },
  controlBtn: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "rgba(153, 174, 199, 0.25)",
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  controlBtnOff: {
    backgroundColor: "rgba(153, 174, 199, 0.55)",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "center",
    gap: 60,
  },
  actionItem: {
    alignItems: "center",
    gap: 12,
  },
  actionLabel: {
    fontSize: 22,
    color: "#103462",
    textAlign: "center",
  },
  endCallBtn: {
    width: 97,
    height: 97,
    borderRadius: 48.5,
    backgroundColor: "#d9d9d9",
    alignItems: "center",
    justifyContent: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  actionBtn: {
    width: 97,
    height: 97,
    borderRadius: 48.5,
    backgroundColor: "#d9d9d9",
    alignItems: "center",
    justifyContent: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
});
