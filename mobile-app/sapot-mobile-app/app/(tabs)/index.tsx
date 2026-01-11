import { FlatList, Pressable, StyleSheet } from "react-native";

import EditScreenInfo from "@/components/EditScreenInfo";
import { Text, View } from "@/components/Themed";
import { useLanUsers, ChatList, zeroconf } from "@/features/chat";
import { useEffect } from "react";

export default function TabOneScreen() {
  const { lanUsers } = useLanUsers();

  useEffect(() => {
    zeroconf.publishService();
    zeroconf.startDiscovery();

    return () => {
      zeroconf.close();
    };
  }, []);

  useEffect(() => {
    console.log(lanUsers);
  }, [lanUsers]);

  return (
    <View style={styles.container}>
      <ChatList lanUsers={lanUsers} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
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
