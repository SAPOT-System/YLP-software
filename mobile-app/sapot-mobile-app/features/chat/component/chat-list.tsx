import { View, Text, FlatList } from "react-native";
import React from "react";
import { Service } from "react-native-zeroconf";

interface ChatListProps {
  lanUsers: Service[];
}

interface ChatListItemProps {
  item: Service;
}

const ChatList = ({ lanUsers }: ChatListProps) => {
  return (
    <View>
      <FlatList
        data={lanUsers}
        renderItem={({ item }) => <ChatListItem item={item} />}
        keyExtractor={(item) => item.txt.id}
      />
    </View>
  );
};

const ChatListItem = ({ item }: ChatListItemProps) => {
  return (
    <View>
      <Text>
        Name: {item.txt.username}
        IP Address: {item.addresses[0]}
        Port: {item.port}
        ID: {item.txt.id}
      </Text>
    </View>
  );
};

export default ChatList;
