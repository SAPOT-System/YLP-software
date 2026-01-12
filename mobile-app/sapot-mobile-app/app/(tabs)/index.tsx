import { StyleSheet } from "react-native";

import { View } from "@/components/Themed";
import { useLanUsers, ChatList, zeroconf } from "@/features/chat";
import { useEffect } from "react";

export default function TabOneScreen() {
  const { peers } = useLanUsers();

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
