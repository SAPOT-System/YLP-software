import { useCallContext } from "@/features/call/context/call-context";
import { uiLog } from "@/features/shared/utils/logger";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Image,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const COLORS = {
  primary: "#103462",
  bannerBg: "#103462",
  bannerText: "#FFFFFF",
  bannerSubText: "rgba(255,255,255,0.7)",
  endRed: "#EA4335",
  endRedBg: "rgba(234, 67, 53, 0.18)",
  activePulse: "#34A853",
};

const STATUS_BAR_HEIGHT =
  Platform.OS === "android" ? StatusBar.currentHeight ?? 24 : 50;

const BANNER_HEIGHT = 56;

const formatDuration = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

// ─────────────────────────────────────────────
// Animated pulse dot
// ─────────────────────────────────────────────

function PulseDot() {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 1.6,
            duration: 700,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 700,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 1,
            duration: 0,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 1,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacity, scale]);

  return (
    <View style={styles.pulseWrap}>
      {/* Ripple ring */}
      <Animated.View
        style={[styles.pulseRing, { transform: [{ scale }], opacity }]}
      />
      {/* Solid dot */}
      <View style={styles.pulseDot} />
    </View>
  );
}

// ─────────────────────────────────────────────
// CallBanner
// ─────────────────────────────────────────────

export function CallBanner() {
  const router = useRouter();

  const {
    callState,
    isMinimized,
    elapsed,
    peerDisplayName,
    peerPhotoUrl,
    handleEndCall,
    maximize,
    peerId,
    callType,
  } = useCallContext();

  // Slide-in animation
  const translateY = useRef(
    new Animated.Value(-(BANNER_HEIGHT + STATUS_BAR_HEIGHT))
  ).current;

  const isVisible =
    isMinimized && (callState === "connected" || callState === "calling");

  useEffect(() => {
    uiLog.debug("[CallBanner] visibility changed", {
      isVisible,
      callState,
      isMinimized,
    });

    Animated.spring(translateY, {
      toValue: isVisible ? 0 : -(BANNER_HEIGHT + STATUS_BAR_HEIGHT),
      useNativeDriver: true,
      bounciness: 4,
      speed: 14,
    }).start();
  }, [isVisible, translateY, callState, isMinimized]);

  const handleTapBanner = () => {
    uiLog.info("[CallBanner] tapped — maximizing call", { peerId, callType });
    maximize();
    router.push(
      `/(drawer)/(tabs)/call/${peerId}?type=${callType}&status=connected`
    );
  };

  const handleTapEnd = () => {
    uiLog.info("[CallBanner] end call tapped from banner");
    handleEndCall();
  };

  // Always render so the slide animation can run in both directions
  return (
    <Animated.View
      style={[styles.banner, { transform: [{ translateY }] }]}
      pointerEvents={isVisible ? "box-none" : "none"}
    >
      <TouchableOpacity
        style={styles.inner}
        onPress={handleTapBanner}
        activeOpacity={0.85}
      >
        {/* Left — avatar + pulse */}
        <View style={styles.avatarSection}>
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
            {callState === "connected" && (
              <View style={styles.pulseContainer}>
                <PulseDot />
              </View>
            )}
          </View>
        </View>

        {/* Center — name + status */}
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>
            {peerDisplayName || "Unknown"}
          </Text>
          <Text style={styles.status}>
            {callState === "calling" ? "Calling..." : formatDuration(elapsed)}
          </Text>
        </View>

        {/* Right — end call */}
        <TouchableOpacity
          style={styles.endBtn}
          onPress={handleTapEnd}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Feather name="phone-off" size={17} color={COLORS.endRed} />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    top: STATUS_BAR_HEIGHT,
    left: 0,
    right: 0,
    height: BANNER_HEIGHT,
    backgroundColor: COLORS.bannerBg,
    zIndex: 9999,
    elevation: 999,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    overflow: "hidden",
  },
  inner: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    gap: 10,
  },

  // Avatar
  avatarSection: {
    position: "relative",
  },
  avatarWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: "visible",
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  avatarFallback: {
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },

  // Pulse
  pulseContainer: {
    position: "absolute",
    bottom: -2,
    right: -2,
  },
  pulseWrap: {
    width: 12,
    height: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  pulseRing: {
    position: "absolute",
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.activePulse,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.activePulse,
    borderWidth: 1.5,
    borderColor: COLORS.bannerBg,
  },

  // Info
  info: {
    flex: 1,
    justifyContent: "center",
    gap: 1,
  },
  name: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.bannerText,
    letterSpacing: 0.1,
  },
  status: {
    fontSize: 12,
    color: COLORS.bannerSubText,
    letterSpacing: 0.2,
  },

  // End button
  endBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.endRedBg,
    alignItems: "center",
    justifyContent: "center",
  },

  // Active bar
  activeBarTrack: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  activeBarFill: {
    height: 2,
    backgroundColor: "rgba(255,255,255,0.35)",
    borderRadius: 1,
  },
});
