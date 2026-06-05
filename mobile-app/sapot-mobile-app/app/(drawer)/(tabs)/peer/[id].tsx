import { usePeerService, useProfilePhoto } from "@/features/shared/hooks";
import { uiLog } from "@/features/shared/utils/logger";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Avatar, Text, useTheme } from "react-native-paper";
import { LoadingSpinner } from "@/features/shared/components/loading-spinner";

export default function PeerProfile() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const peerService = usePeerService();
  const { url: profilePicUrl } = useProfilePhoto(id ?? null);
  const [peerName, setPeerName] = useState("Unknown user");
  const [username, setUsername] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    uiLog.info("[PeerProfile] mounted");
    return () => {
      uiLog.info("[PeerProfile] unmounted");
    };
  }, []);

  useEffect(() => {
    uiLog.debug("[PeerProfile] useEffect triggered, deps:", { id });
    let isMounted = true;

    const loadPeer = async () => {
      if (!id) {
        uiLog.warn("[PeerProfile] missing peer id");
        if (isMounted) setIsLoading(false);
        return;
      }

      try {
        const peer = await peerService.findPeerById(id);
        if (!isMounted) return;

        const displayName = peer
          ? `${peer.firstName ?? ""} ${peer.lastName ?? ""}`.trim() ||
            peer.username ||
            "Unknown user"
          : "Unknown user";
        setPeerName(displayName);
        setUsername(peer.username);
      } catch (error) {
        uiLog.error("[PeerProfile] Error in load peer", { error });
        if (isMounted) setPeerName("Unknown user");
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadPeer();

    return () => {
      isMounted = false;
    };
  }, [id, peerService]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.secondary }}>
      <View style={{ padding: 34, alignItems: "center" }}>
        {isLoading ? (
          <LoadingSpinner />
        ) : (
          <>
            <View style={{ alignItems: "center", gap: 20 }}>
              {profilePicUrl ? (
                <Avatar.Image size={150} source={{ uri: profilePicUrl }} />
              ) : (
                <Avatar.Text
                  size={150}
                  label={(peerName[0] ?? "?").toUpperCase()}
                />
              )}
              <View>
                <Text
                  style={{
                    fontWeight: "700",
                    fontSize: 24,
                    color: theme.dark ? "#E6ECF5" : "#000",
                  }}
                >
                  {peerName}
                </Text>
                <Text>@{username}</Text>
              </View>
            </View>
          </>
        )}
      </View>
    </View>
  );
}
