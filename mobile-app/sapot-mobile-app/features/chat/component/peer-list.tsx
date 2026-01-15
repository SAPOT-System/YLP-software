import { View, Text, FlatList, Pressable } from "react-native";
import React from "react";
import { Peer } from "@/features/shared";
import { withObservables } from "@nozbe/watermelondb/react";

const PeerList = ({ peers }: { peers: Peer[] }) => {
  console.log(peers[0]);
  return (
    <View>
      <Text style={{ fontSize: 16 }}>Peer List</Text>

      <FlatList
        horizontal
        contentContainerStyle={{ gap: 5, paddingHorizontal: 4 }}
        data={peers}
        renderItem={({ item }) => <EnhancedPeerListItem peer={item} />}
        keyExtractor={(peer) => peer.id}
      />
    </View>
  );
};

const PeerListItem = ({ peer }: { peer: Peer }) => {
  return (
    <Pressable
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
};

const enhance = withObservables(["peer"], ({ peer }: { peer: Peer }) => ({
  peer,
}));

const EnhancedPeerListItem = enhance(PeerListItem);

export default PeerList;
