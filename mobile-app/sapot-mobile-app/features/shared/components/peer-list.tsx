import { ChatRoomSource } from "@/features/chat/types";
import { withObservables } from "@nozbe/watermelondb/react";
import { useRouter } from "expo-router";
import React from "react";
import { FlatList, Pressable, View } from "react-native";
import { Avatar, Text, useTheme } from "react-native-paper";
import { Peer } from "../database";
import { useActivePeers } from "../hooks/use-active-users";
import { useProfilePhoto } from "../hooks/use-profile-photo";
import { uiLog } from "../utils/logger";
uiLog.debug("[peer-list] module loaded");

const PeerList = () => {
  const peers = useActivePeers();
  const theme = useTheme();
  return (
    <View style={{ gap: 12, marginTop: 12 }}>
      <Text
        variant="bodyLarge"
        style={{
          fontSize: 20,
          fontWeight: 700,
          color: theme.dark ? "#9AA7C1" : "#103462",
        }}
      >
        Active Peers
      </Text>

      <FlatList
        horizontal
        contentContainerStyle={{ gap: 24 }}
        data={peers}
        renderItem={({ item }) => <PeerListItem peer={item} />}
        keyExtractor={(peer) => peer.id}
      />
    </View>
  );
};

const enhancePeer = withObservables(["peer"], ({ peer }: { peer: Peer }) => ({
  peer: peer.observe(),
}));

const PeerListItem = enhancePeer(({ peer }: { peer: Peer }) => {
  const router = useRouter();
  const theme = useTheme();

  const { url: profilePicUrl } = useProfilePhoto(peer.id);
  const handlePress = () => {
    uiLog.info("peer-list › open chat", { peerId: peer.id });
    router.push({
      pathname: "/(drawer)/(tabs)/chat/[id]",
      params: { id: peer.id, source: ChatRoomSource.PEER },
    });
  };
  return (
    <Pressable
      onPress={handlePress}
      style={{ display: "flex", alignItems: "center" }}
    >
      {profilePicUrl ? (
        <Avatar.Image size={60} source={{ uri: profilePicUrl }} />
      ) : (
        <Avatar.Text
          size={60}
          label={(
            peer.firstName?.[0] ??
            peer.username?.[0] ??
            "?"
          ).toUpperCase()}
        />
      )}
      <Text style={{ color: theme.dark ? "#9AA7C1" : "#103462" }}>
        {peer.firstName}
      </Text>
    </Pressable>
  );
});

export default PeerList;
