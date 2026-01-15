import { StyleSheet } from "react-native";

import { View } from "@/components/Themed";
import { PeerList, usePeers } from "@/features/chat";

export default function Chat() {
  const { peers } = usePeers();

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
