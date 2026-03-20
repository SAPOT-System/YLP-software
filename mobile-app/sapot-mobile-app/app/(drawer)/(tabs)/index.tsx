import { StyleSheet, View } from "react-native";

import { ChatList, useChats } from "@/features/chat";
import { useAuth } from "@/features/auth";
import { PeerList } from "@/features/shared";
import {
  useConnectionService,
  useDiscoveryService,
  usePeers,
} from "@/features/shared/hooks";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { Searchbar } from "react-native-paper";
import { TouchableOpacity } from "react-native";
import { APP_ROUTES } from "@/app/routes";
import { ActivityIndicator } from "react-native-paper";

export default function Chat() {
  const auth = useAuth();

  const { peers } = usePeers();
  const { chats } = useChats();

  const router = useRouter();
  const discoveryService = useDiscoveryService();
  const connectionService = useConnectionService();

  if (!auth) {
    return <ActivityIndicator />;
  }

  useEffect(() => {
    connectionService.setSignalingToken(auth.accessToken ?? undefined);
  }, [auth.accessToken, connectionService]);

  useEffect(() => {
    console.log("home mount");
    discoveryService.publishDevice();
    discoveryService.startDiscovery();
    connectionService.start();
    const audioCallHandler = (peerId: string) =>
      router.push({
        pathname: "/(drawer)/(tabs)/call/[id]",
        params: { id: peerId },
      });
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
      <TouchableOpacity onPress={() => router.push(APP_ROUTES.SEARCH)}>
        <Searchbar
          pointerEvents="none"
          editable={false}
          value=""
          placeholder="Search"
        />
      </TouchableOpacity>
      <PeerList peers={peers} />
      <ChatList chats={chats} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
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
