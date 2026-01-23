import { StyleSheet } from "react-native";

import { View } from "@/components/Themed";
import { ChatList, useChats } from "@/features/chat";
import { usePeers, PeerList } from "@/features/shared";

export default function Chat() {
  const { peers } = usePeers();
  const { chats } = useChats();

  return (
    <View style={styles.container}>
      <PeerList peers={peers} />
      <ChatList chats={chats} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
  },
  separator: {
    marginVertical: 30,
    height: 1,
    width: "80%",
  },
});
