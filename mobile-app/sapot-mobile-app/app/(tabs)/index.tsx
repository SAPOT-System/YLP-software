import { FlatList, Pressable, StyleSheet } from "react-native";

import EditScreenInfo from "@/components/EditScreenInfo";
import { Text, View } from "@/components/Themed";
import { useLanUsers, ChatList, zeroconf } from "@/features/chat";
import { useEffect } from "react";
import useDatabase from "@/features/shared/hooks/use-database";

export default function TabOneScreen() {
  const { peers } = useLanUsers();

  const { createPeer, showPeers, deletePeers, deleteDatabase } = useDatabase();

  useEffect(() => {
    zeroconf.publishService();
    zeroconf.startDiscovery();

    return () => {
      zeroconf.close();
    };
  }, []);

  return (
    <View style={styles.container}>
      <ChatList peers={peers} />
      {/* <Pressable
        onPress={() =>
          createPeer({
            username: "adam",
            id: "232",
            port: 9000,
            ipAddress: "192.168.1.1",
          })
        }
      >
        <Text>Create Peer</Text>
      </Pressable>
      <Pressable onPress={showPeers}>
        <Text>Show Peer</Text>
      </Pressable>
      <Pressable onPress={deletePeers}>
        <Text>Delete Peers</Text>
      </Pressable>
      <Pressable onPress={deleteDatabase}>
        <Text>Delete database</Text>
      </Pressable> */}
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
