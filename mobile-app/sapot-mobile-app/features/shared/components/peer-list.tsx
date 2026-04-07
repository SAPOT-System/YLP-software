import { View, FlatList, Pressable } from "react-native";
import { Text } from "react-native-paper";
import React from "react";
import { withObservables } from "@nozbe/watermelondb/react";
import { useRouter } from "expo-router";
import { database, Peer } from "../database";
import { ChatRoomSource } from "@/features/chat/types";
import { Avatar, useTheme } from "react-native-paper";
import { useProfilePhoto } from "../hooks";

const enhancePeers = withObservables([], () => ({
  peers: database.get<Peer>("peers").query().observe(),
}));

const PeerList = enhancePeers(({ peers }: { peers: Peer[] }) => {
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
        Peer Active
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
});

const enhancePeer = withObservables(["peer"], ({ peer }: { peer: Peer }) => ({
  peer,
}));

const PeerListItem = enhancePeer(({ peer }: { peer: Peer }) => {
  const router = useRouter();
  const theme = useTheme();

  const { url: profilePicUrl } = useProfilePhoto(peer.id);
  return (
    <Pressable
      onPress={() =>
        router.push({
          pathname: "/(drawer)/(tabs)/chat/[id]",
          params: { id: peer.id, source: ChatRoomSource.PEER },
        })
      }
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
