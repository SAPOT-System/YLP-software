import React, { useEffect } from "react";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Link, Tabs, useRouter } from "expo-router";
import { Pressable } from "react-native";

import Colors from "@/constants/Colors";
import { useColorScheme } from "@/components/useColorScheme";
import { useClientOnlyValue } from "@/components/useClientOnlyValue";
import {
  useConnectionService,
  useDiscoveryService,
} from "@/features/shared/hooks";
// You can explore the built-in icon families and icons on the web at https://icons.expo.fyi/
function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>["name"];
  color: string;
}) {
  return <FontAwesome size={28} style={{ marginBottom: -3 }} {...props} />;
}

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const discoveryService = useDiscoveryService();
  const connectionService = useConnectionService();

  useEffect(() => {
    discoveryService.publishDevice();
    discoveryService.startDiscovery();
    connectionService.start();
    const audioCallHandler = (peerId: string) =>
      router.push({ pathname: "/call/[id]", params: { id: peerId } });
    const callEndedHandler = () => router.back();
    connectionService.on("audio-call", audioCallHandler);
    connectionService.on("call-ended", callEndedHandler);

    return () => {
      discoveryService.destroy();
      connectionService.stop();
      connectionService.disconnect();
      connectionService.off("audio-call", audioCallHandler);
      connectionService.off("call-ended", callEndedHandler);
    };
  }, []);
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? "light"].tint,
        // Disable the static render of the header on web
        // to prevent a hydration error in React Navigation v6.
        headerShown: useClientOnlyValue(false, true),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Chats",
          tabBarIcon: ({ color }) => <TabBarIcon name="code" color={color} />,
          headerRight: () => (
            <Link href="/modal" asChild>
              <Pressable>
                {({ pressed }) => (
                  <FontAwesome
                    name="info-circle"
                    size={25}
                    color={Colors[colorScheme ?? "light"].text}
                    style={{ marginRight: 15, opacity: pressed ? 0.5 : 1 }}
                  />
                )}
              </Pressable>
            </Link>
          ),
        }}
      />
      <Tabs.Screen
        name="debug"
        options={{
          title: "Debugger",
          tabBarIcon: ({ color }) => <TabBarIcon name="code" color={color} />,
        }}
      />
    </Tabs>
  );
}
