import { useCallService } from "@/features/call";
import { Peer } from "@/features/shared/database/model/Peer";
import {
  useConnectionService,
  usePeerService,
  useProfilePhoto,
} from "@/features/shared/hooks";
import { stopForegroundService } from "@/features/shared/hooks/use-background-task";
import { navLog, uiLog } from "@/features/shared/utils/logger";
import * as Notifications from "expo-notifications";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function IncomingCall() {
  const router = useRouter();
  const { id, type, conversationId } = useLocalSearchParams<{
    id: string;
    type: string;
    conversationId?: string;
  }>();
  const callService = useCallService();
  const connectionService = useConnectionService();
  const peerService = usePeerService();

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

  useFocusEffect(
    useCallback(() => {
      const timer = setTimeout(() => {
        navLog.info("[IncomingCall] did not answer");
        callService
          .markMissedIncomingCall(
            (type as "audio" | "video") ?? "audio",
            id as string,
            conversationId || undefined
          )
          .catch((error) => {
            uiLog.error("[IncomingCall] Error while marking missed call", {
              error,
            });
          });
        router.replace("/(drawer)/(tabs)");
      }, 30_000);

      return () => clearTimeout(timer);
    }, [callService, id, router, type, conversationId])
  );

  // If the caller cancels before we accept, go back and clean up
  useEffect(() => {
    const handler = async (payload: { peerId: string }) => {
      if (payload.peerId !== id) return;
      uiLog.info(
        "[Navigation] goBack triggered from IncomingCall — caller cancelled"
      );
      // Dismiss incoming call notifications from the tray
      try {
        const presented = await Notifications.getPresentedNotificationsAsync();
        for (const n of presented) {
          console.log(n.request.content.data);
          if (n.request.content.data.type === "incoming_call") {
            await Notifications.dismissNotificationAsync(n.request.identifier);
          }
        }
      } catch {
        uiLog.info(
          "[Navigation] goBack triggered from IncomingCall — caller cancelled"
        );
      }
      // Stop foreground service — no call to keep alive for
      await stopForegroundService();
      router.replace("/(drawer)/(tabs)");
    };
    connectionService.on("call-ended", handler);
    return () => {
      connectionService.off("call-ended", handler);
    };
  }, [connectionService, id, router]);

  const handleAccept = async () => {
    uiLog.debug("[IncomingCall] handleAccept called", {
      id,
      type,
      conversationId,
    });
    try {
      await callService.answerCall(
        (type as "audio" | "video") ?? "audio",
        id as string,
        conversationId || undefined
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
    router.replace({
      pathname: "/(drawer)/(tabs)/call/[id]" as never,
      params: { id: id!, type: type ?? "audio", status: "answering" },
    });
  };

  const handleReject = async () => {
    uiLog.debug("[IncomingCall] handleReject called", { id });
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
    router.replace("/(drawer)/(tabs)");
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
