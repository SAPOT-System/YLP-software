import { View, Text, FlatList, Pressable } from "react-native";
import React from "react";
import { Peer } from "../types";

interface PeerListProps {
  peers: Peer[];
}

interface PeerListItemProps {
  peer: Peer;
}

const PeerList = ({ peers }: PeerListProps) => {
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
};

const PeerListItem = ({ peer }: PeerListItemProps) => {
  return (
    <Pressable
      style={{
        backgroundColor: `${peer.online ? "green" : "grey"}`,
        paddingVertical: 5,
        paddingHorizontal: 10,
        borderRadius: 4,
      }}
    >
      <Text>{peer.username}</Text>
    </Pressable>
  );
};

export default PeerList;
