import { View, Text, FlatList, Pressable } from "react-native";
import React from "react";
import { withObservables } from "@nozbe/watermelondb/react";
import { useRouter } from "expo-router";
import { database, Peer } from "../database";
import { ChatRoomSource } from "@/features/chat/types";

const enhancePeers = withObservables([], () => ({
  peers: database.get<Peer>("peers").query().observe(),
}));

const PeerList = enhancePeers(({ peers }: { peers: Peer[] }) => {
  return (
    <View>
      <Text style={{ fontSize: 16 }}>Peer List</Text>

      <FlatList
        horizontal
        contentContainerStyle={{ gap: 5, paddingHorizontal: 4 }}
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
  return (
    <Pressable
      onPress={() =>
        router.push({
          pathname: "/(drawer)/(tabs)/chat/[id]",
          params: { id: peer.id, source: ChatRoomSource.PEER },
        })
      }
      style={{
        backgroundColor: `${peer.isOnline ? "green" : "grey"}`,
        paddingVertical: 5,
        paddingHorizontal: 10,
        borderRadius: 4,
      }}
    >
      <Text>{peer.username}</Text>
    </Pressable>
  );
});

export default PeerList;
