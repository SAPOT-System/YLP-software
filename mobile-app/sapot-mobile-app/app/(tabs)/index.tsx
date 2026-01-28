import { StyleSheet, View } from "react-native";

import { ChatList, useChats } from "@/features/chat";
import { PeerList } from "@/features/shared";
import {
  useConnectionService,
  useDiscoveryService,
  usePeers,
} from "@/features/shared/hooks";
import { useRouter } from "expo-router";
import { useEffect } from "react";

export default function Chat() {
  const { peers } = usePeers();
  const { chats } = useChats();

  const router = useRouter();
  const discoveryService = useDiscoveryService();
  const connectionService = useConnectionService();

  useEffect(() => {
    console.log("hello");
    discoveryService.publishDevice();
    discoveryService.startDiscovery();
    connectionService.start();
    const audioCallHandler = (peerId: string) =>
      router.push({ pathname: "/(tabs)/call/[id]", params: { id: peerId } });
    const callEndedHandler = () => router.back();
    connectionService.on("audio-call", audioCallHandler);
    connectionService.on("call-ended", callEndedHandler);

    return () => {
      discoveryService.destroy();
      connectionService.stop();
      connectionService.off("audio-call", audioCallHandler);
      connectionService.off("call-ended", callEndedHandler);
    };
  }, []);

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
