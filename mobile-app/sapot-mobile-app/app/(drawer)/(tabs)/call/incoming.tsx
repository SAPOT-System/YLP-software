import { useCallService } from "@/features/call";
import { Peer } from "@/features/shared/database/model/Peer";
import {
  useConnectionService,
  usePeerService,
  useProfilePhoto,
  useUserStore,
} from "@/features/shared/hooks";
import { uiLog } from "@/features/shared/utils/logger";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function IncomingCall() {
  const router = useRouter();
  const { id, type } = useLocalSearchParams<{ id: string; type: string }>();
  const callService = useCallService();
  const connectionService = useConnectionService();
  const peerService = usePeerService();
  const userStore = useUserStore();

  const [peer, setPeer] = useState<Peer | null>(null);
  const { url: peerPhotoUrl } = useProfilePhoto(id);

  const peerDisplayName = peer
    ? [peer.firstName, peer.lastName].filter(Boolean).join(" ")
    : "";

  useEffect(() => {
    uiLog.info("[IncomingCall] mounted");
    return () => {
      uiLog.info("[IncomingCall] unmounted");
    };
  }, []);

  useEffect(() => {
    uiLog.debug("[IncomingCall] useEffect triggered, deps:", { id });
    peerService
      .findPeerById(id as string)
      .then((p: unknown) => setPeer(p as Peer))
      .catch((error) => {
        uiLog.error("[IncomingCall] Error in load peer", { error });
      });
  }, [id, peerService]);

  // If the caller cancels before we accept, go back
  useEffect(() => {
    const handler = (fromId?: string) => {
      if (fromId && fromId !== id) return;
      uiLog.info("[Navigation] goBack triggered from IncomingCall");
      router.back();
    };
    connectionService.on("call-ended", handler);
    return () => {
      connectionService.off("call-ended", handler);
    };
  }, [connectionService, id, router]);

  const handleAccept = async () => {
    uiLog.debug("[IncomingCall] handleAccept called", { id, type });
    try {
      await callService.startCall(
        (type as "audio" | "video") ?? "audio",
        id as string
      );
    } catch (error) {
      uiLog.error("[IncomingCall] Error in start call", { error });
    }
    uiLog.info("[Navigation] Navigating to CallRoom", {
      screen: "/(drawer)/(tabs)/call/[id]",
      peerId: id,
      type: type ?? "audio",
      status: "connected",
    });
    router.replace({
      pathname: "/(drawer)/(tabs)/call/[id]" as never,
      params: { id: id!, type: type ?? "audio", status: "connected" },
    });
  };

  const handleReject = () => {
    uiLog.debug("[IncomingCall] handleReject called", { id });
    try {
      connectionService.sendCallMessage(id as string, {
        type: "call-ended",
        data: { from: userStore.user.id, to: id as string },
      });
    } catch (error) {
      uiLog.error("[IncomingCall] Error in reject call", { error });
    }
    uiLog.info("[Navigation] goBack triggered from IncomingCall");
    router.back();
  };

  return (
    <LinearGradient
      colors={["#99AEC7", "#FFFFFF"]}
      start={{ x: 0, y: 1 }}
      end={{ x: 0, y: 0 }}
      style={styles.container}
    >
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

      {/* Status */}
      <Text style={styles.statusText}>Incoming call...</Text>

      {/* Accept / Reject */}
      <View style={styles.actions}>
        <View style={styles.actionItem}>
          <TouchableOpacity style={styles.actionBtn} onPress={handleAccept}>
            <Feather name="phone" size={28} color="#34A853" />
          </TouchableOpacity>
          <Text style={styles.actionLabel}>Accept</Text>
        </View>
        <View style={styles.actionItem}>
          <TouchableOpacity style={styles.actionBtn} onPress={handleReject}>
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
