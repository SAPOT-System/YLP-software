import { View, Text, FlatList } from "react-native";
import React from "react";
import { Peer } from "../types";

interface ChatListProps {
  peers: Peer[];
}

interface ChatListItemProps {
  peer: Peer;
}

const ChatList = ({ peers }: ChatListProps) => {
  return (
    <View>
      <FlatList
        data={peers}
        renderItem={({ item }) => <ChatListItem peer={item} />}
        keyExtractor={(peer) => peer.id}
      />
    </View>
  );
};

const ChatListItem = ({ peer }: ChatListItemProps) => {
  return (
    <View>
      <Text>
        Name: {peer.username}
        IP Address: {peer.ipAddress}
        Port: {peer.port}
        ID: {peer.id}
        Status: {peer.online ? "Online" : "Offline"}
      </Text>
    </View>
  );
};

export default ChatList;
