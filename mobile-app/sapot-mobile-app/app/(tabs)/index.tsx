import { StyleSheet } from "react-native";

import { View } from "@/components/Themed";
import { useLanUsers, zeroconf, PeerList } from "@/features/chat";
import { useEffect } from "react";

export default function Chat() {
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
      <PeerList peers={peers} />
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
