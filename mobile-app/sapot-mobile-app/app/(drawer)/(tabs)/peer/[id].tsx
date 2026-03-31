import { useCallService } from "@/features/call";
import { usePeerService } from "@/features/shared/hooks";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import {
  ActivityIndicator,
  Avatar,
  IconButton,
  Text,
  useTheme,
} from "react-native-paper";

export default function PeerProfile() {
  const theme = useTheme();
  const callService = useCallService();
  const { id } = useLocalSearchParams<{ id: string }>();
  const peerService = usePeerService();
  const [peerName, setPeerName] = useState("Unknown user");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadPeer = async () => {
      if (!id) {
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
      } catch {
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

  const handleCall = async (peerId: string) => {
    callService.informPeerForIncomingAudioCall(peerId);
    await callService.startCall(peerId);
    router.push({
      pathname: "/(drawer)/(tabs)/call/[id]",
      params: { id: peerId! },
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.secondary }}>
      <View style={{ padding: 34, alignItems: "center" }}>
        {isLoading ? (
          <ActivityIndicator />
        ) : (
          <>
            <View style={{ alignItems: "center", gap: 20 }}>
              <Avatar.Text size={150} label={peerName[0].toUpperCase()} />
              <Text
                style={{
                  fontWeight: "700",
                  fontSize: 24,
                  color: theme.dark ? "#E6ECF5" : "#000",
                }}
              >
                {peerName}
              </Text>
            </View>
            <View
              style={{
                gap: 16,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  fontSize: 17,
                  fontWeight: "medium",
                  color: theme.dark ? "#E6ECF5" : "#000",
                }}
              >
                09123456789
              </Text>
              <IconButton
                icon="phone"
                size={20}
                iconColor="#00E700"
                onPress={() => id && handleCall(id)}
              />
              <IconButton
                icon="video"
                size={20}
                onPress={() => id && handleCall(id)}
              />
              <IconButton icon="email" size={20} />
            </View>
            <View style={{ width: "100%" }}>
              <Pressable
                style={{
                  paddingVertical: 18,
                  borderTopWidth: 1,
                  borderBottomWidth: 1,
                  borderColor: "#C9C9C9",
                }}
              >
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: "semibold",
                    color: theme.dark ? "#E6ECF5" : "#000",
                  }}
                >
                  Add to Contacts
                </Text>
              </Pressable>
              <Pressable
                style={{
                  paddingVertical: 18,
                  borderBottomWidth: 1,
                  borderColor: "#C9C9C9",
                }}
              >
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: "semibold",
                    color: theme.dark ? "#E6ECF5" : "#000",
                  }}
                >
                  Block
                </Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </View>
  );
}
