import { useCallService } from "@/features/call";
import { useCallContext } from "@/features/call/context/call-context";
import { Peer } from "@/features/shared/core/database/model/Peer";
import {
  useConnectionService,
  usePeerService,
  useProfilePhoto,
  useThrottledPress,
} from "@/features/shared/hooks";
import { useMediaPermissions } from "@/features/shared/hooks/use-media-permissions";
import { uiLog } from "@/features/shared/core/utils/logger";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  BackHandler,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function IncomingCall() {
  const router = useRouter();
  const { id, type, conversationId, callerName, callId } = useLocalSearchParams<{
    id: string;
    type: string;
    conversationId?: string;
    callerName: string;
    callId?: string;
  }>();
  const callService = useCallService();
  const connectionService = useConnectionService();
  const peerService = usePeerService();
  const { requestMediaPermissions } = useMediaPermissions();
  const { incomingCall, setIncomingCall, clearIncomingCall, minimizeIncoming } =
    useCallContext();

  const [peer, setPeer] = useState<Peer | null>(null);
  const { url: peerPhotoUrl } = useProfilePhoto(id);

  const peerDisplayName = peer
    ? [peer.firstName, peer.lastName].filter(Boolean).join(" ")
    : "";
  // The peer row is loaded asynchronously and may not exist yet on a first
  // contact, so fall back to the name the caller sent with the ring.
  const displayName = peerDisplayName || callerName;

  useEffect(() => {
    uiLog.info("[IncomingCall] mounted");
    return () => {
      uiLog.info("[IncomingCall] unmounted");
    };
  }, []);

  // Register (or reconnect to, if returning from minimized) the ringing call.
  // The 30s no-answer timeout and caller-cancel listener live in CallContext
  // via useIncomingCallLifecycle so they survive this screen minimizing.
  //
  // This screen sits in a bottom-tab navigator, which never unmounts a screen it
  // has already rendered — answering only blurs it behind the call room. Register
  // each ring at most once, keyed on its identity, so that `clearIncomingCall()`
  // on accept/reject cannot be immediately undone from here. Resurrecting an
  // answered ring re-arms its no-answer timeout, which tears the live call down
  // 30s later, and flips CallBanner back to its "Incoming call…" variant.
  const registeredRingRef = useRef<string | null>(null);
  const ringKey = `${id}|${callId ?? ""}`;

  useEffect(() => {
    if (incomingCall || registeredRingRef.current === ringKey) return;
    registeredRingRef.current = ringKey;
    setIncomingCall({
      peerId: id as string,
      callType: (type as "audio" | "video") ?? "audio",
      conversationId: conversationId || undefined,
      callId: callId || undefined,
      callerName,
    });
  }, [incomingCall, setIncomingCall, ringKey, id, type, conversationId, callId, callerName]);

  // Hardware back minimizes the ringing call instead of dropping it silently.
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      minimizeIncoming();
      return true;
    });
    return () => subscription.remove();
  }, [minimizeIncoming]);

  useEffect(() => {
    uiLog.debug("[IncomingCall] useEffect triggered, deps:", { id });
    peerService
      .findPeerById(id as string)
      .then((p: unknown) => setPeer(p as Peer))
      .catch((error) => {
        uiLog.error("[IncomingCall] Error in load peer", { error });
      });
  }, [id, peerService]);

  const handleAccept = useCallback(async () => {
    uiLog.debug("[IncomingCall] handleAccept called", {
      id,
      type,
      conversationId,
    });
    const granted = await requestMediaPermissions(
      (type as "audio" | "video") ?? "audio"
    );
    if (!granted) return;

    await connectionService.dismissIncomingCallNotification();
    try {
      await callService.answerCall(
        (type as "audio" | "video") ?? "audio",
        id as string,
        conversationId || undefined,
        callId || undefined
      );
    } catch (error) {
      uiLog.error("[IncomingCall] Error in start call", { error });
    }
    uiLog.info("[Navigation] Navigating to CallRoom", {
      screen: "/(drawer)/(tabs)/call/[id]",
      peerId: id,
      type: type ?? "audio",
      status: "answering",
    });
    clearIncomingCall();
    router.replace({
      pathname: "/(drawer)/(tabs)/call/[id]" as never,
      params: { id: id!, type: type ?? "audio", status: "answering" },
    });
  }, [id, type, conversationId, callId, requestMediaPermissions, connectionService, callService, clearIncomingCall, router]);

  const handleReject = useCallback(async () => {
    uiLog.debug("[IncomingCall] handleReject called", { id });
    await connectionService.dismissIncomingCallNotification();
    try {
      await callService.rejectIncomingCall(
        (type as "audio" | "video") ?? "audio",
        id as string,
        conversationId || undefined
      );
    } catch (error) {
      uiLog.error("[IncomingCall] Error in reject call", { error });
    }
    uiLog.info("[Navigation] goBack triggered from IncomingCall");
    clearIncomingCall();
    router.replace("/(drawer)/(tabs)");
  }, [id, type, conversationId, connectionService, callService, clearIncomingCall, router]);

  const { onPress: onAccept, busy: accepting } = useThrottledPress(handleAccept);
  const { onPress: onReject, busy: rejecting } = useThrottledPress(handleReject);

  return (
    <LinearGradient
      colors={["#99AEC7", "#FFFFFF"]}
      start={{ x: 0, y: 1 }}
      end={{ x: 0, y: 0 }}
      style={styles.container}
    >
      {/* Minimize */}
      <TouchableOpacity style={styles.backButton} onPress={minimizeIncoming}>
        <Feather name="chevron-down" size={28} color="#103462" />
      </TouchableOpacity>

      {/* Peer section */}
      <View style={styles.peerSection}>
        <View style={styles.avatarWrap}>
          {peerPhotoUrl ? (
            <Image source={{ uri: peerPhotoUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarInitial}>
                {displayName ? displayName[0].toUpperCase() : "?"}
              </Text>
            </View>
          )}
        </View>
        <Text style={styles.peerName}>{displayName}</Text>
      </View>

      {/* Status */}
      <Text style={styles.statusText}>Incoming call...</Text>

      {/* Accept / Reject */}
      <View style={styles.actions}>
        <View style={styles.actionItem}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={onAccept}
            disabled={accepting || rejecting}
          >
            <Feather name="phone" size={28} color="#34A853" />
          </TouchableOpacity>
          <Text style={styles.actionLabel}>Accept</Text>
        </View>
        <View style={styles.actionItem}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={onReject}
            disabled={accepting || rejecting}
          >
            <Feather name="phone-off" size={28} color="#EA4335" />
          </TouchableOpacity>
          <Text style={styles.actionLabel}>Reject</Text>
        </View>
      </View>
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
  },
  actions: {
    position: "absolute",
    bottom: 100,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 60,
  },
  actionItem: {
    alignItems: "center",
    gap: 12,
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
  actionLabel: {
    fontSize: 22,
    color: "#103462",
    textAlign: "center",
  },
});
