import { StyleSheet } from "react-native";

import { View } from "@/components/Themed";
import { ChatList, PeerList, usePeers } from "@/features/chat";
import useChats from "@/features/chat/hooks/use-chats";

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
