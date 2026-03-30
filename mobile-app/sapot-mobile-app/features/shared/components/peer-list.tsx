import { View, FlatList, Pressable } from "react-native";
import { Text } from "react-native-paper";
import React from "react";
import { withObservables } from "@nozbe/watermelondb/react";
import { useRouter } from "expo-router";
import { database, Peer } from "../database";
import { ChatRoomSource } from "@/features/chat/types";
import { Avatar, useTheme } from "react-native-paper";

const enhancePeers = withObservables([], () => ({
  peers: database.get<Peer>("peers").query().observe(),
}));

const PeerList = enhancePeers(({ peers }: { peers: Peer[] }) => {
  return (
    <View style={{ gap: 12, marginTop: 12 }}>
      <Text variant="bodyLarge" style={{ fontSize: 20, fontWeight: "600" }}>
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
  return (
    <Pressable
      onPress={() =>
        router.push({
          pathname: "/(drawer)/(tabs)/chat/[id]",
          params: { id: peer.id, source: ChatRoomSource.PEER },
        })
      }
    >
      <Avatar.Text
        size={60}
        label={peer.username[0].toUpperCase()}
        style={{ backgroundColor: theme.colors.primary }}
      />
      <Text>{peer.firstName}</Text>
    </Pressable>
  );
});

export default PeerList;
