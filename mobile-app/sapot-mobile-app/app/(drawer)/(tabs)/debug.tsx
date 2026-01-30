import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import {
  useDatabase,
  useChatService,
  usePeerService,
} from "@/features/shared/hooks";

export default function Debug() {
  const { createPeer, showPeers, deletePeers, deleteDatabase } = useDatabase();
  const peerService = usePeerService();
  const chatService = useChatService();

  return (
    <View style={styles.container}>
      <View>
        <Text style={{ fontSize: 15 }}>Use Database Hook</Text>
        <View style={styles.buttonContainer}>
          <Pressable
            style={styles.button}
            onPress={() =>
              createPeer({
                username: "Pixel_4a",
                id: "0e9f1e5a-415b-4dfd-84f1-73916f74fc27",
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
      <View>
        <Text>Chat Service</Text>
        <View style={styles.buttonContainer}>
          <Pressable
            style={styles.button}
            onPress={async () => await chatService.deleteAllConversations()}
          >
            <Text style={styles.buttonText}>Delete conversations</Text>
          </Pressable>
          <Pressable
            style={styles.button}
            onPress={async () => await chatService.getAllParticipants()}
          >
            <Text style={styles.buttonText}>Get participants</Text>
          </Pressable>
          <Pressable
            style={styles.button}
            onPress={async () => await chatService.getAllStatus()}
          >
            <Text style={styles.buttonText}>Get Status</Text>
          </Pressable>
        </View>
        {/* <View style={styles.buttonContainer}>
          <Pressable
            style={styles.button}
            onPress={() => console.log(tcpSocket.getServer())}
          >
            <Text style={styles.buttonText}>Get Server</Text>
          </Pressable>
          <Pressable
            style={styles.button}
            onPress={async () => console.log(await tcpSocket.stopServer())}
          >
            <Text style={styles.buttonText}>Stop Server</Text>
          </Pressable>
          <Pressable
            style={styles.button}
            onPress={() => console.log(tcpSocket.startServer())}
          >
            <Text style={styles.buttonText}>Start Server</Text>
          </Pressable>
          <Pressable
            style={styles.button}
            onPress={() => tcpSocket.connect("10.0.2.2", 1)}
          >
            <Text style={styles.buttonText}>Connect to server</Text>
          </Pressable>
        </View> */}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 4,
  },
  buttonContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginInline: 2,
  },
  input: {
    height: 44,
    fontSize: 16,
    color: "#111827",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    paddingVertical: 8,
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
