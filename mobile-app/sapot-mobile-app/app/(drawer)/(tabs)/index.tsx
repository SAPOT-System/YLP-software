import { StyleSheet, View } from "react-native";

import { APP_ROUTES } from "@/app/routes";
import { useAuth } from "@/features/auth";
import { ChatList, useChats } from "@/features/chat";
import { PeerList } from "@/features/shared";
import {
  useConnectionService,
  useDiscoveryService,
  usePeers,
} from "@/features/shared/hooks";
import { useHeaderHeight } from "@react-navigation/elements";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { TouchableOpacity } from "react-native";
import { ActivityIndicator, Searchbar, useTheme } from "react-native-paper";

export default function Chat() {
  const auth = useAuth();
  const theme = useTheme();
  const headerHeight = useHeaderHeight();
  const topGradientColors: [string, string] = theme.dark
    ? ["#0F1830", "#1E2E67"]
    : ["#FFF", "#99AEC7"];

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
      <LinearGradient
        colors={topGradientColors}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[
          styles.topSection,
          { paddingTop: headerHeight + 16 },
        ]}
      >
        <TouchableOpacity onPress={() => router.push(APP_ROUTES.SEARCH)}>
          <Searchbar
            pointerEvents="none"
            editable={false}
            value=""
            placeholder="Search"
            style={styles.searchbar}
          />
        </TouchableOpacity>
        <PeerList peers={peers} />
      </LinearGradient>
      <View
        style={[
          styles.chatListContainer,
          { backgroundColor: theme.colors.background },
        ]}
      >
        <ChatList chats={chats} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topSection: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomLeftRadius: 27,
    borderBottomRightRadius: 27,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.25,
    shadowRadius: 15,
    elevation: 8,
  },
  chatListContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  searchbar: {
    marginBottom: 12,
  },
});
