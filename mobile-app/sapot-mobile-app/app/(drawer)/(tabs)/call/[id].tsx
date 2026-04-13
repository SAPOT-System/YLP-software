import { AudioRouteTypes, useCallService } from "@/features/call";
import { Peer } from "@/features/shared/database/model/Peer";
import {
  useConnectionService,
  usePeerService,
  useProfilePhoto,
} from "@/features/shared/hooks";
import { callLog, uiLog } from "@/features/shared/utils/logger";
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
    type: "video" | "audio";
    status?: string;
  }>();
  const callService = useCallService();
  const connectionService = useConnectionService();
  const peerService = usePeerService();

  const [callState, setCallState] = useState<CallState>(
    status === "connected" ? "connected" : "calling"
  );
  const [localMic, setLocalMic] = useState(true);
  const [localCam, setLocalCam] = useState(true);
  const [remoteMic, setRemoteMic] = useState(true);
  const [remoteCam, setRemoteCam] = useState(true);
  const currentRouteRef = useRef<AudioRouteTypes | undefined>(undefined);

  const [peer, setPeer] = useState<Peer | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [localStream, setLocalStream] = useState<MediaStream | undefined>();
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const [remoteStreamUrl, setRemoteStreamUrl] = useState<string>();
  const hasTerminated = useRef(false);
  const [ready, setReady] = useState(false);

  const { url: peerPhotoUrl } = useProfilePhoto(id);

  const peerDisplayName = peer
    ? [peer.firstName, peer.lastName].filter(Boolean).join(" ")
    : "";

  const navigateAway = useCallback(() => {
    router.replace("/(drawer)/(tabs)");
  }, [router]);

  useEffect(() => {
    uiLog.info("[CallRoom] mounted");
    return () => {
      uiLog.info("[CallRoom] unmounted");
    };
  }, []);

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

  useEffect(() => {
    const callReadyHandler = (peerId: string) => {
      callLog.info("[CallRoom] Call ready received");
      if (peerId !== id) {
        callLog.warn("[CallRoom] Peer id does not match");
        return;
      }
      callLog.info("[CallRoom] Starting call");
      callService.startCall(type, peerId); // TODO: persistently try to start call since it is acknowledge by the receiver
    };

    const micOnHandler = (peerId: string) => {
      if (id !== peerId) {
        uiLog.warn("[CallRoom] Call control rejected");
        return;
      }
      callLog.info("[CallRoom] Remote mic on");
      setRemoteMic(true);
    };
    const micOffHandler = (peerId: string) => {
      if (id !== peerId) {
        uiLog.warn("[CallRoom] Call control rejected");
        return;
      }
      callLog.info("[CallRoom] Remote mic off");
      setRemoteMic(false);
    };
    const camOnHandler = (peerId: string) => {
      if (id !== peerId) {
        uiLog.warn("[CallRoom] Call control rejected");
        return;
      }
      callLog.info("[CallRoom] Remote camera on");
      setRemoteCam(true);
    };
    const camOffHandler = (peerId: string) => {
      if (id !== peerId) {
        uiLog.warn("[CallRoom] Call control rejected");
        return;
      }
      callLog.info("[CallRoom] Remote camera off");
      setRemoteCam(false);
    };

    connectionService.on("call-ready", callReadyHandler);
    connectionService.on("mic-on", micOnHandler);
    connectionService.on("mic-off", micOffHandler);
    connectionService.on("camera-on", camOnHandler);
    connectionService.on("camera-off", camOffHandler);

    return () => {
      connectionService.off("call-ready", callReadyHandler);
      connectionService.off("mic-on", micOffHandler);
      connectionService.off("mic-off", micOnHandler);
      connectionService.off("camera-on", camOffHandler);
      connectionService.off("camera-off", camOnHandler);
    };
  }, [callService, connectionService, id, type]);

  useFocusEffect(
    useCallback(() => {
      const interval = setInterval(() => {
        callLog.debug("[CallRoom]", {
          hasRemoteStream: !!remoteStreamRef.current,
          streamId: remoteStreamRef.current?.id,
          trackCount: remoteStreamRef.current?.getTracks().length,
          streamUrl: remoteStreamRef.current?.toURL(),
        });
      }, 2000);

      return () => clearInterval(interval);
    }, [])
  );

  useEffect(() => {
    if (remoteStreamRef) {
      const timer = setTimeout(() => setReady(true), 100);
      return () => clearTimeout(timer);
    }
  }, [remoteStreamRef]);

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
      setLocalCam(true);
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
      remoteStreamRef.current = stream;
      setRemoteStreamUrl(stream.toURL());
      setCallState("connected");
    };
    callService.on("remoteStream", handler);
    return () => {
      callService.off("remoteStream", handler);
    };
  }, [callService]);

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
      navigateAway();
    }, 3000);
    return () => clearTimeout(timer);
  }, [callState, id, navigateAway]);

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
    setCallState("ended");
    await terminate();
  }, [terminate]);

  // Listen for remote peer ending the call
  useEffect(() => {
    const handler = async (fromId?: string) => {
      if (fromId && fromId !== id) return;
      uiLog.info("call › remote ended", { peerId: id });
      await terminate();
      setCallState("ended");
    };
    connectionService.on("call-ended", handler);
    return () => {
      connectionService.off("call-ended", handler);
    };
  }, [connectionService, id, terminate]);

  const handleClose = useCallback(() => {
    uiLog.info("[Navigation] handleClose triggered from CallRoom");
    navigateAway();
  }, [navigateAway]);

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
    uiLog.debug("[CallRoom] handleToggleMic called", { localMic });
    try {
      callService.toggleMic(id as string);
      setLocalMic((v) => !v);
    } catch (error) {
      uiLog.error("[CallRoom] Error in toggle localMic", { error });
    }
  }, [callService, id, localMic]);

  const handleToggleCam = useCallback(() => {
    uiLog.debug("[CallRoom] handleToggleCam called", { localCam });
    try {
      callService.toggleCamera(id as string);
      setLocalCam((v) => !v);
    } catch (error) {
      uiLog.error("[CallRoom] Error in toggle camera", { error });
    }
  }, [callService, id, localCam]);

  const handleVolume = useCallback(() => {
    uiLog.debug("[CallRoom] handleVolume called");
    try {
      callService.toggleSpeaker();
    } catch (error) {
      uiLog.error("[CallRoom] Error in toggle speaker", { error });
    }
  }, [callService]);

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
          <View style={styles.remoteVideoWrap}>
            {ready && remoteCam ? (
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
            <View
              style={[
                styles.remoteMicBadge,
                !remoteMic && styles.remoteMicBadgeMuted,
              ]}
            >
              <Feather
                name={remoteMic ? "mic" : "mic-off"}
                size={16}
                color="#FFFFFF"
              />
            </View>
          </View>
          {localStream && localCam ? (
            <RTCView
              streamURL={localStream?.toURL()}
              mirror={true}
              objectFit="cover"
              zOrder={1}
              style={styles.localVideo}
            />
          ) : (
            <View style={styles.localVideo} />
          )}
        </View>
      )}

      {/* Controls row (calling or connected) */}
      {isActive && (
        <View style={styles.controls}>
          <View style={styles.controlRow}>
            <TouchableOpacity
              style={[styles.controlBtn, !localMic && styles.controlBtnOff]}
              onPress={handleToggleMic}
            >
              <Feather
                name={localMic ? "mic" : "mic-off"}
                size={22}
                color={COLORS.primary}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.controlBtn, !localCam && styles.controlBtnOff]}
              onPress={handleToggleCam}
            >
              <Feather
                name={localCam ? "video" : "video-off"}
                size={22}
                color={COLORS.primary}
              />
            </TouchableOpacity>
            <TouchableOpacity style={styles.controlBtn} onPress={handleVolume}>
              <Feather
                name={
                  currentRouteRef.current === "earpiece"
                    ? "volume-1"
                    : "volume-2"
                }
                size={22}
                color={COLORS.primary}
              />
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
  remoteVideoWrap: {
    flex: 1,
    position: "relative",
  },
  remoteVideo: {
    flex: 1,
    backgroundColor: "#000",
  },
  remoteMicBadge: {
    position: "absolute",
    left: 14,
    bottom: 14,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.55)",
  },
  remoteMicBadgeMuted: {
    backgroundColor: "rgba(234, 67, 53, 0.85)",
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
