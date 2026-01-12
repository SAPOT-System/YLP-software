import { Pressable, StyleSheet } from "react-native";

import EditScreenInfo from "@/components/EditScreenInfo";
import { Text, View } from "@/components/Themed";
import { useDatabase } from "@/features/shared";

export default function Debug() {
  const { createPeer, showPeers, deletePeers, deleteDatabase } = useDatabase();
  return (
    <View style={styles.container}>
      <Text style={{fontSize: 15}}>Use Database Hook</Text>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 4,
          marginInline: 2,
        }}
      >
        <Pressable
          style={styles.button}
          onPress={() =>
            createPeer({
              username: "adam",
              id: "232",
              port: 9000,
              ipAddress: "192.168.1.1",
            })
          }
        >
          <Text style={styles.buttonText}>Create Peer</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={showPeers}>
          <Text style={styles.buttonText}>Show Peer</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={deletePeers}>
          <Text style={styles.buttonText}>Delete Peers</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={deleteDatabase}>
          <Text style={styles.buttonText}>Delete database</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 4
  },
  button: {
    backgroundColor: "#4F46E5",
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 12,
    elevation: 3, // Android shadow
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  buttonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
});
