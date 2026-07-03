import { useCallContext } from "@/features/call/context/call-context";
import { useThrottledPress } from "@/features/shared/hooks";
import { uiLog } from "@/features/shared/core/utils/logger";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  BackHandler,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { RTCView } from "react-native-webrtc";

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

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

// ─────────────────────────────────────────────
// CallRoom
// ─────────────────────────────────────────────

export default function CallRoom() {
  const { id, type, status } = useLocalSearchParams<{
    id: string;
    type: "video" | "audio";
    status?: string;
  }>();

  const {
    callState,
    elapsed,
    peerDisplayName,
    peerPhotoUrl,
    localStream,
    remoteStreamUrl,
    localMic,
    localCam,
    remoteMic,
    remoteCam,
    currentRoute,
    isFrontCamera,
    remoteStreamVersion,
    resetCallState,
    handleEndCall,
    handleCallAgain,
    handleToggleMic,
    handleToggleCam,
    handleSwitchCamera,
    handleVolume,
    minimize,
    handleClose,
  } = useCallContext();

  // ─────────────────────────────────────────────
  // Lifecycle logs
  // ─────────────────────────────────────────────

  useEffect(() => {
    uiLog.info("[CallRoom] mounted");
    return () => {
      uiLog.info("[CallRoom] unmounted");
    };
  }, []);

  // ─────────────────────────────────────────────
  // Kick off the call when this screen gains focus
  // (handles both fresh navigation and returning from minimized)
  // ─────────────────────────────────────────────

  useFocusEffect(
    useCallback(() => {
      uiLog.debug("[CallRoom] useFocusEffect triggered", { id, type, status });

      if (status === "connected") {
        // Returning from minimized — nothing to reset, call is already live
        uiLog.info("[CallRoom] returning from minimized, no reset needed");
        return;
      }

      if (status === "calling" || (status === "answering" && id && type)) {
        // Fresh call initiation
        uiLog.info("[CallRoom] initiating outgoing call", { id, type });
        resetCallState(id, type);
      }
    }, [id, type, status, resetCallState]),
  );

  const { onPress: onEndCall, busy: ending } = useThrottledPress(handleEndCall);
  const { onPress: onCallAgain, busy: callingAgain } =
    useThrottledPress(handleCallAgain);

  // ─────────────────────────────────────────────
  // Hardware back handling
  // While a call is live, hardware back must minimize (not pop the screen
  // and leave the call dangling); the on-screen chevron does the same.
  // ─────────────────────────────────────────────

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (
          callState === "calling" ||
          callState === "connected" ||
          callState === "reconnecting"
        ) {
          minimize();
          return true;
        }
        return false;
      },
    );

    return () => subscription.remove();
  }, [callState, minimize]);

  // ─────────────────────────────────────────────
  //  CONTROL ROW ANIMATION
  // ─────────────────────────────────────────────

  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controlsAnim = useRef(new Animated.Value(1)).current;

  const hideControls = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);

    Animated.timing(controlsAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setControlsVisible(false);
    });
  }, [controlsAnim]);

  const showControls = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);

    setControlsVisible(true);

    Animated.timing(controlsAnim, {
      toValue: 1,
      duration: 250,
      useNativeDriver: true,
    }).start();

    hideTimer.current = setTimeout(() => {
      hideControls();
    }, 5000);
  }, [hideControls, controlsAnim]);

  useEffect(() => {
    if (callState === "calling") {
      // Reset visibility without starting an auto-hide timer — the end call
      // button must stay visible for the full duration of the outgoing ring.
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setControlsVisible(true);
      Animated.timing(controlsAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }).start();
    } else if (callState === "connected" || callState === "reconnecting") {
      showControls();
    }

    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [callState, showControls, controlsAnim]);

  // ─────────────────────────────────────────────
  // Derived UI flags
  // ─────────────────────────────────────────────

  const isActive =
    callState === "calling" ||
    callState === "connected" ||
    callState === "reconnecting";
  const showVideoStreams = callState === "connected" || callState === "reconnecting";

  // ─────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────

  return (
    <Pressable
      style={{ flex: 1 }}
      onPress={() => {
        if (callState === "connected" || callState === "reconnecting") {
          showControls();
        }
      }}
    >
      <LinearGradient
        colors={[COLORS.gradStart, COLORS.gradEnd]}
        start={{ x: 0, y: 1 }}
        end={{ x: 0, y: 0 }}
        style={styles.container}
      >
        {/* Back / minimize button (shown when connected or reconnecting) */}
        {(callState === "connected" || callState === "reconnecting") && (
          <TouchableOpacity style={styles.backButton} onPress={minimize}>
            <Feather name="chevron-down" size={28} color={COLORS.primary} />
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
          {callState === "reconnecting" && "Reconnecting…"}
          {callState === "ended" && "Call ended"}
          {callState === "no-answer" && "Did not answer"}
          {callState === "busy" && `${peerDisplayName} is in another call`}
        </Text>

        {/* Video streams (video call, connected or reconnecting state) */}
        {showVideoStreams && (
          <View style={styles.videoContainer}>
            <View style={styles.remoteVideoWrap}>
              {remoteStreamUrl && remoteCam && callState === "connected" ? (
                <RTCView
                  key={remoteStreamVersion}
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
                streamURL={localStream.toURL()}
                mirror={true}
                objectFit="cover"
                zOrder={1}
                style={styles.localVideo}
              />
            ) : (
              <View style={styles.localVideo} />
            )}

            {callState === "reconnecting" && (
              <View style={styles.reconnectingOverlay}>
                <Text style={styles.reconnectingOverlayText}>Reconnecting…</Text>
              </View>
            )}
          </View>
        )}

        {/* Controls row (calling or connected) */}
        {isActive && (
          <View style={styles.controls}>
            {controlsVisible && (
              <Animated.View
                style={{
                  opacity: controlsAnim,
                  transform: [
                    {
                      translateY: controlsAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [60, 0], // slides whole block
                      }),
                    },
                  ],
                  alignItems: "center",
                  gap: 48,
                }}
              >
                <View style={styles.controlRow}>
                  <TouchableOpacity
                    style={[
                      styles.controlBtn,
                      !localMic && styles.controlBtnOff,
                    ]}
                    onPress={handleToggleMic}
                  >
                    <Feather
                      name={localMic ? "mic" : "mic-off"}
                      size={22}
                      color={COLORS.primary}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.controlBtn,
                      !localCam && styles.controlBtnOff,
                    ]}
                    onPress={handleToggleCam}
                  >
                    <Feather
                      name={localCam ? "video" : "video-off"}
                      size={22}
                      color={COLORS.primary}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.controlBtn}
                    onPress={handleVolume}
                  >
                    <Feather
                      name={
                        currentRoute === "earpiece" ? "volume-1" : "volume-2"
                      }
                      size={22}
                      color={COLORS.primary}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.controlBtn}
                    onPress={handleSwitchCamera}
                  >
                    <Feather
                      name={isFrontCamera ? "rotate-cw" : "rotate-ccw"}
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
                      onPress={onEndCall}
                      disabled={ending}
                    >
                      <Feather
                        name="phone-off"
                        size={28}
                        color={COLORS.declineRed}
                      />
                    </TouchableOpacity>
                    <Text style={styles.actionLabel}>End Call</Text>
                  </View>
                </View>
              </Animated.View>
            )}
          </View>
        )}

        {/* Ended actions */}
        {callState === "ended" && (
          <View style={styles.controls}>
            <View style={styles.actionRow}>
              <View style={styles.actionItem}>
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={handleClose}
                >
                  <Feather name="x" size={28} color={COLORS.primary} />
                </TouchableOpacity>
                <Text style={styles.actionLabel}>Close</Text>
              </View>
            </View>
          </View>
        )}

        {/* Did not answer actions */}
        {callState === "no-answer" && (
          <View style={styles.controls}>
            <View style={styles.actionRow}>
              <View style={styles.actionItem}>
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={handleClose}
                >
                  <Feather name="x" size={28} color={COLORS.primary} />
                </TouchableOpacity>
                <Text style={styles.actionLabel}>Close</Text>
              </View>
              <View style={styles.actionItem}>
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={onCallAgain}
                  disabled={callingAgain}
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
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={handleClose}
                >
                  <Feather name="x" size={28} color={COLORS.primary} />
                </TouchableOpacity>
                <Text style={styles.actionLabel}>Close</Text>
              </View>
              <View style={styles.actionItem}>
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={onCallAgain}
                  disabled={callingAgain}
                >
                  <Feather name="phone" size={28} color={COLORS.acceptGreen} />
                </TouchableOpacity>
                <Text style={styles.actionLabel}>Call again</Text>
              </View>
            </View>
          </View>
        )}
      </LinearGradient>
    </Pressable>
  );
}

// ─────────────────────────────────────────────
// Styles (unchanged from original)
// ─────────────────────────────────────────────

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
    gap: 20,
  },
  controlBtn: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "#D6DFEA",
    alignItems: "center",
    justifyContent: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  controlBtnOff: {
    backgroundColor: "#D6DFEA",
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
  reconnectingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5,
  },
  reconnectingOverlayText: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "500",
  },
});
